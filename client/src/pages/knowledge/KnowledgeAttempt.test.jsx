import React from 'react';
import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { AuthContext } from '../../contexts/AuthContextStore';
import * as recovery from '../../utils/quizRecovery';
import KnowledgeAttempt from './KnowledgeAttempt';

function openStudentAttempt() {
  return render(<AuthContext.Provider value={{ user: { id: 12, role: 'respondent', first_name: 'Test', last_name: 'Student' } }}>
    <MemoryRouter initialEntries={['/respondent/knowledge/attempts/23']}><Routes>
      <Route path="/respondent/knowledge/attempts/:attemptId" element={<KnowledgeAttempt />} />
    </Routes></MemoryRouter>
  </AuthContext.Provider>);
}

function renderResult(reason, expiredOnLoad = false) {
  const question = { id: 11, category_id: 1, category_name: 'Computer Literacy', prompt: 'A fixture question?', type: 'true_false',
    options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }], points: 1 };
  const snapshot = { title: 'Saved assessment result', pass_percentage: 80, questions: [question, { ...question, id: 12 }] };
  vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue(null);
  vi.spyOn(recovery, 'clearQuizRecovery').mockResolvedValue();
  vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
  const result = {
    attempt: { id: 23, status: 'completed', completion_reason: reason, completed_at: '2030-01-01T12:00:00Z', certificate_earned: 0 },
    responses: [{ question_id: 11, answer: 'true' }], snapshot,
    results: { earned: 1, possible: 2, percentage: 50, level: 'Needs Improvement', categories: [], questions: [] },
  };
  vi.spyOn(api, 'get').mockResolvedValue({ data: { data: expiredOnLoad ? { ...result, results: null,
    attempt: { ...result.attempt, status: 'in_progress', completion_reason: null, answers_revision: 0, deadline: new Date(Date.now() - 10000).toISOString() },
    server_now: new Date().toISOString() } : result } });
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: result } });
  openStudentAttempt();
  return post;
}

function answerFixture() {
  const category = { category_id: 1, category_name: 'Computer Literacy', points: 1 };
  return {
    attempt: { id: 23, status: 'in_progress', answers_revision: 0 },
    snapshot: { title: 'Practice assessment', pass_percentage: 80, questions: [
      { ...category, id: 11, prompt: 'Choose a web browser.', type: 'multiple_choice', options: [{ id: 'browser', text: 'Firefox' }, { id: 'other', text: 'Calculator' }] },
      { ...category, id: 12, prompt: 'A strong password can protect an account.', type: 'true_false', options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }] },
      { ...category, id: 13, prompt: 'Name a file that stores tabular text.', type: 'identification', options: [] },
    ] },
    responses: [],
  };
}

function clockFixture(now, remaining, leaseUntil = now + 15000, closesAt = null) {
  return {
    status: 'in_progress',
    server_now: new Date(now).toISOString(),
    timer: { remaining_ms: remaining, lease_until: new Date(leaseUntil).toISOString(), closes_at: closesAt, expired: remaining === 0 },
  };
}

describe('timed assessment interruptions', () => {
  it('pauses the display and question controls when offline, and resumes with confirmed time', async () => {
    const attempt = answerFixture();
    let time = Date.now();
    let online = true;
    const initial = clockFixture(time, 60000);
    vi.spyOn(Date, 'now').mockImplementation(() => time);
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue(null);
    vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { ...attempt, ...initial } } });
    const post = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: { data: initial } })
      .mockImplementation(async (path) => {
        expect(path).toBe('/knowledge/attempts/23/clock');
        return { data: { data: clockFixture(time, 45000) } };
      });
    openStudentAttempt();
    expect(await screen.findByRole('radio', { name: 'Firefox' })).toBeEnabled();
    expect(screen.getByLabelText('Time remaining')).toHaveTextContent('01:00');

    time += 4000;
    online = false;
    fireEvent(window, new Event('offline'));
    expect(screen.getByRole('heading', { name: 'Assessment timer paused' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Time remaining')).toHaveTextContent('00:56');
    time += 90000;
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByLabelText('Time remaining')).toHaveTextContent('00:56');
    expect(post).toHaveBeenCalledTimes(1);

    online = true;
    fireEvent(window, new Event('online'));
    expect(await screen.findByRole('radio', { name: 'Firefox' })).toBeEnabled();
    expect(screen.getByLabelText('Time remaining')).toHaveTextContent('00:45');
    expect(screen.queryByText('Time expired', { exact: true })).not.toBeInTheDocument();
  });

  it('reopens the same timed attempt with saved answers and restored time after a blackout', async () => {
    const attempt = answerFixture();
    const startedAt = Date.now();
    let time = startedAt;
    vi.spyOn(Date, 'now').mockImplementation(() => time);
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue(null);
    vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
    const initial = clockFixture(time, 60000);
    const savedResponses = [{ question_id: 11, answer: 'browser' }];
    const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { data: { ...attempt, ...initial } } })
      .mockImplementation(async () => ({ data: { data: { ...attempt, ...clockFixture(time, 45000, startedAt + 15000),
        attempt: { ...attempt.attempt, answers_revision: 1 }, responses: savedResponses } } }));
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: { data: { answers_revision: 1 } } });
    const post = vi.spyOn(api, 'post').mockImplementation(async () => ({ data: { data: clockFixture(time, time === startedAt ? 60000 : 45000) } }));
    const page = openStudentAttempt();
    fireEvent.click(await screen.findByRole('radio', { name: 'Firefox' }));
    await waitFor(() => expect(put).toHaveBeenCalledOnce());
    page.unmount();

    time += 120000;
    openStudentAttempt();
    expect(await screen.findByRole('radio', { name: 'Firefox' })).toBeChecked();
    expect(screen.getByLabelText('Time remaining')).toHaveTextContent('00:45');
    expect(get.mock.calls.map(([path]) => path)).toEqual(['/knowledge/attempts/23', '/knowledge/attempts/23']);
    expect(post.mock.calls.map(([path]) => path)).toEqual(['/knowledge/attempts/23/clock', '/knowledge/attempts/23/clock']);
  });

  it('waits for the assessment server when the browser still reports internet access', async () => {
    const attempt = answerFixture();
    const initial = clockFixture(Date.now(), 60000);
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue(null);
    vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { ...attempt, ...initial } } });
    vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Server unavailable'))
      .mockResolvedValueOnce({ data: { data: clockFixture(Date.now(), 58000) } });
    openStudentAttempt();

    expect(await screen.findByRole('heading', { name: 'Assessment timer paused' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect timer' }));
    expect(await screen.findByRole('radio', { name: 'Firefox' })).toBeEnabled();
  });

  it('finalizes only after the server confirms the scheduled closing time passed offline', async () => {
    const attempt = answerFixture();
    let time = Date.now();
    let online = true;
    const closesAt = new Date(time + 30000).toISOString();
    const initial = clockFixture(time, 30000, time + 15000, closesAt);
    vi.spyOn(Date, 'now').mockImplementation(() => time);
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue(null);
    vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
    vi.spyOn(recovery, 'clearQuizRecovery').mockResolvedValue();
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { ...attempt, ...initial } } });
    const post = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: { data: initial } })
      .mockImplementation(async (path) => {
        const clock = clockFixture(time, 0, time - 1000, closesAt);
        if (path.endsWith('/clock')) return { data: { data: clock } };
        expect(path).toBe('/knowledge/attempts/23/submit');
        return { data: { data: { ...attempt, ...clock,
          attempt: { ...attempt.attempt, status: 'completed', completion_reason: 'time_expired', completed_at: new Date(time).toISOString() },
          results: { earned: 0, possible: 3, percentage: 0, level: 'Needs Improvement', categories: [], questions: [] },
        } } };
      });
    openStudentAttempt();
    expect(await screen.findByRole('radio', { name: 'Firefox' })).toBeEnabled();
    online = false;
    fireEvent(window, new Event('offline'));
    time += 60000;
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByLabelText('Time remaining')).toHaveTextContent('00:00');
    expect(post).toHaveBeenCalledTimes(1);

    online = true;
    fireEvent(window, new Event('online'));
    expect(await screen.findByText('Time expired', { exact: true })).toBeInTheDocument();
    expect(post.mock.calls.map(([path]) => path)).toEqual([
      '/knowledge/attempts/23/clock', '/knowledge/attempts/23/clock', '/knowledge/attempts/23/submit',
    ]);
  });
});

describe('student assessment answers', () => {
  it('answers all three question types, reviews the responses, and renders the submitted result', async () => {
    const attempt = answerFixture();
    const saved = new Map();
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue(null);
    vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
    vi.spyOn(recovery, 'clearQuizRecovery').mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: attempt } });
    vi.spyOn(api, 'put').mockImplementation(async (_path, batch) => {
      for (const response of batch.responses) saved.set(response.question_id, response);
      return { data: { data: { answers_revision: batch.expected_revision + 1 } } };
    });
    const submit = vi.spyOn(api, 'post').mockImplementation(async () => ({ data: { data: {
      ...attempt,
      attempt: { ...attempt.attempt, status: 'completed', completion_reason: 'submitted', completed_at: '2030-01-01T12:00:00Z', certificate_earned: 1 },
      responses: [...saved.values()],
      results: { earned: 3, possible: 3, percentage: 100, level: 'Advanced', categories: [], questions: [] },
    } } }));
    openStudentAttempt();

    await screen.findByRole('radio', { name: 'Firefox' });
    fireEvent.click(screen.getByRole('button', { name: 'Review all answers' }));
    expect(screen.getByRole('button', { name: 'Submit assessment' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue answering' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Firefox' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('radio', { name: 'True' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: 'CSV' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review answers' }));
    expect(screen.getByRole('heading', { name: 'Review your answers' })).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit assessment' }));

    expect(await screen.findByText('Assessment submitted', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download achievement certificate' })).toBeInTheDocument();
    expect(submit).toHaveBeenCalledOnce();
    expect([...saved.values()]).toEqual([
      { question_id: 11, answer: 'browser' },
      { question_id: 12, answer: 'true' },
      { question_id: 13, answer: 'CSV' },
    ]);
  });

  it('reconciles an interrupted save before uploading a newer answer', async () => {
    const attempt = answerFixture();
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue(null);
    vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
    const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { data: attempt } }).mockResolvedValue({
      data: { data: { ...attempt, attempt: { ...attempt.attempt, answers_revision: 1 }, responses: [{ question_id: 11, answer: 'browser' }] } },
    });
    const put = vi.spyOn(api, 'put').mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockRejectedValueOnce({ response: { status: 409 } })
      .mockResolvedValueOnce({ data: { data: { answers_revision: 2 } } });
    openStudentAttempt();

    fireEvent.click(await screen.findByRole('radio', { name: 'Firefox' }));
    await screen.findByText(/Upload pending/);
    fireEvent.click(screen.getByRole('radio', { name: 'Calculator' }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(3));
    expect(put.mock.calls[1][1]).toEqual(put.mock.calls[0][1]);
    expect(put.mock.calls[2][1]).toEqual({ expected_revision: 1, responses: [{ question_id: 11, answer: 'other' }] });
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Answers changed in another tab or device')).not.toBeInTheDocument();
    expect(await screen.findByText('All answers saved to the server')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Calculator' })).toBeChecked();
  });

  it('recovers an answer after reopening offline and uploads it on reconnection', async () => {
    const attempt = answerFixture();
    let online = true;
    let stored = null;
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    vi.spyOn(recovery, 'readQuizRecovery').mockImplementation(async () => stored);
    vi.spyOn(recovery, 'writeQuizRecovery').mockImplementation(async (userId, attemptId, record) => {
      stored = structuredClone({ ...record, userId, attemptId });
    });
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { data: attempt } }).mockRejectedValueOnce(new Error('Network offline'));
    vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { recorded: true } } });
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: { data: { answers_revision: 1 } } });
    const original = openStudentAttempt();

    const answer = await screen.findByRole('radio', { name: 'Firefox' });
    online = false;
    fireEvent(window, new Event('offline'));
    fireEvent.click(answer);
    expect(await screen.findByText(/saved on this device. reconnect/i)).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
    original.unmount();

    openStudentAttempt();
    expect(await screen.findByRole('radio', { name: 'Firefox' })).toBeChecked();
    expect(screen.getByText(/recovered on this device/i)).toBeInTheDocument();
    online = true;
    fireEvent(window, new Event('online'));
    expect(await screen.findByText('All answers saved to the server')).toBeInTheDocument();
    expect(put).toHaveBeenCalledExactlyOnceWith('/knowledge/attempts/23/answers', {
      expected_revision: 0,
      responses: [{ question_id: 11, answer: 'browser' }],
    });
    expect(stored).toMatchObject({ pending: false, baseRevision: 1, answers: { 11: 'browser' } });
  });

  it('keeps answers saved only by the other session when a student keeps local responses', async () => {
    const attempt = answerFixture();
    const later = { ...attempt, attempt: { ...attempt.attempt, answers_revision: 1 },
      responses: [{ question_id: 11, answer: 'other' }, { question_id: 12, answer: 'true' }] };
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue({
      userId: 12, attemptId: 23, data: attempt, answers: { 11: 'browser' }, pending: true, baseRevision: 0, revision: 1,
    });
    vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: later } });
    vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { recorded: true } } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: { data: { answers_revision: 2 } } });
    openStudentAttempt();

    expect(await screen.findByText('Answers changed in another tab or device')).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep this device’s answers' }));
    expect(await screen.findByText('All answers saved to the server')).toBeInTheDocument();
    expect(put).toHaveBeenCalledExactlyOnceWith('/knowledge/attempts/23/answers', {
      expected_revision: 1,
      responses: [{ question_id: 11, answer: 'browser' }, { question_id: 12, answer: 'true' }],
    });
    expect(screen.getByRole('radio', { name: 'Firefox' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('radio', { name: 'True' })).toBeChecked();
  });

  it('refreshes a recovered attempt that was completed on another device while offline', async () => {
    const attempt = answerFixture();
    const serverData = { ...attempt,
      attempt: { ...attempt.attempt, status: 'completed', completion_reason: 'submitted', completed_at: new Date().toISOString() },
      responses: [{ question_id: 11, answer: 'browser' }, { question_id: 12, answer: 'true' }, { question_id: 13, answer: 'CSV' }],
      results: { earned: 3, possible: 3, percentage: 100, level: 'Advanced', categories: [], questions: [] },
    };
    let online = false;
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue({
      userId: 12, attemptId: 23, data: attempt, answers: {}, pending: false, baseRevision: 0, revision: 0,
    });
    vi.spyOn(recovery, 'clearQuizRecovery').mockResolvedValue();
    const get = vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('Network offline')).mockResolvedValueOnce({ data: { data: serverData } });
    const put = vi.spyOn(api, 'put').mockResolvedValue({});
    const post = vi.spyOn(api, 'post').mockResolvedValue({});
    openStudentAttempt();

    expect(await screen.findByText(/recovered on this device/i)).toBeInTheDocument();
    online = true;
    fireEvent(window, new Event('online'));
    expect(await screen.findByText('Assessment submitted', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
    expect(put).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('saved assessment result reason', () => {
  it('explains that a partial timed-out score was recorded without showing a completion celebration', async () => {
    renderResult('time_expired');
    expect(await screen.findByText('Time expired', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 answers reached the server before the deadline/)).toBeInTheDocument();
    expect(screen.getByText(/timer continued while you were away/)).toBeInTheDocument();
    expect(screen.queryByText('Assessment complete', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Assessment submitted', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('50%', { exact: true })).toBeInTheDocument();
  });

  it('preserves submitted-result wording for an actual learner submission', async () => {
    renderResult('submitted');
    expect(await screen.findByText('Assessment submitted', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/timer continued while you were away/)).not.toBeInTheDocument();
  });

  it('automatically finalizes a reopened expired attempt with a timeout explanation instead of a success celebration', async () => {
    const success = vi.spyOn(toast, 'success');
    const post = renderResult('time_expired', true);
    expect(await screen.findByText('Time expired', { exact: true })).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/knowledge/attempts/23/submit');
    expect(success).not.toHaveBeenCalled();
    expect(screen.queryByText('Assessment submitted', { exact: true })).not.toBeInTheDocument();
  });

  it('lets the student retry a timed-out submission after a connection failure', async () => {
    const post = renderResult('time_expired', true);
    post.mockRejectedValueOnce(new Error('Connection interrupted'));
    const retry = await screen.findByRole('button', { name: 'Retry finalizing assessment' });
    expect(screen.getByRole('alert')).toHaveTextContent('Connection interrupted');
    fireEvent.click(retry);
    expect(await screen.findByText('Time expired', { exact: true })).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('scores server answers and retains the local copy when reconnecting after the deadline', async () => {
    const fixture = answerFixture();
    const responses = [{ question_id: 11, answer: 'browser' }];
    const expired = { ...fixture, responses, attempt: { ...fixture.attempt, answers_revision: 1, deadline: new Date(Date.now() - 5000).toISOString() } };
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue({
      userId: 12, attemptId: 23, data: expired, answers: { 11: 'browser', 12: 'true' }, pending: true, baseRevision: 1, revision: 2,
    });
    vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
    const clear = vi.spyOn(recovery, 'clearQuizRecovery').mockResolvedValue();
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('Network offline'));
    const put = vi.spyOn(api, 'put').mockRejectedValue({ response: { status: 410 } });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: {
      ...expired,
      attempt: { ...expired.attempt, status: 'completed', completion_reason: 'time_expired', completed_at: new Date().toISOString() },
      results: { earned: 1, possible: 3, percentage: 33.33, level: 'Needs Improvement', categories: [], questions: [] },
    } } });
    let online = false;
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    openStudentAttempt();

    expect(await screen.findByText(/time has ended. reconnect/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Firefox' })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
    online = true;
    fireEvent(window, new Event('online'));

    expect(await screen.findByText('Time expired', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 answers reached the server/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download local recovery copy' })).toBeInTheDocument();
    expect(post).toHaveBeenCalledExactlyOnceWith('/knowledge/attempts/23/submit');
    expect(put).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('withholds accepted answers and renders locked review safely while showing integrity signals to staff', async () => {
    const question = { id: 11, category_id: 1, category_name: 'Computer Literacy', prompt: 'Protected prompt?', type: 'true_false',
      options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }], points: 1 };
    const snapshot = { title: 'Locked review exam', pass_percentage: 80, questions: [question] };
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue(null);
    vi.spyOn(recovery, 'clearQuizRecovery').mockResolvedValue();
    vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { data: {
      attempt: { id: 23, status: 'completed', completion_reason: 'submitted', completed_at: '2030-01-01T12:00:00Z', certificate_earned: 0 },
      responses: [{ question_id: 11, answer: 'true' }], snapshot,
      results: { earned: 1, possible: 1, percentage: 100, level: 'Advanced', categories: [], review_locked: true, questions: [{ ...question, answer: 'true' }] },
    } } });
    render(<AuthContext.Provider value={{ user: { id: 12, role: 'respondent', first_name: 'Test', last_name: 'Student' } }}>
      <MemoryRouter initialEntries={['/respondent/knowledge/attempts/23']}><Routes>
        <Route path="/respondent/knowledge/attempts/:attemptId" element={<KnowledgeAttempt />} />
      </Routes></MemoryRouter>
    </AuthContext.Provider>);
    expect(await screen.findByText(/Detailed answer keys, item correctness, and explanations are withheld/)).toBeInTheDocument();
    expect(screen.getByText('Protected prompt?', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/Accepted answer:/)).not.toBeInTheDocument();
  });

  it('blocks copying prompts, pasting or dropping content, and logs browser focus changes', async () => {
    const attempt = answerFixture();
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue(null);
    vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { data: attempt } });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { recorded: true } } });
    const put = vi.spyOn(api, 'put');
    openStudentAttempt();

    const heading = await screen.findByRole('heading', { name: /choose a web browser/i });
    expect(screen.getByText(/Independent work monitoring is active/)).toBeInTheDocument();
    const copy = createEvent.copy(heading, { bubbles: true, cancelable: true });
    const menu = createEvent.contextMenu(heading, { bubbles: true, cancelable: true });
    fireEvent(heading, copy);
    fireEvent(heading, menu);
    expect(copy.defaultPrevented).toBe(true);
    expect(menu.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const answer = screen.getByRole('textbox', { name: 'Your answer' });
    const paste = createEvent.paste(answer, { bubbles: true, cancelable: true });
    const drop = createEvent.drop(answer, { bubbles: true, cancelable: true });
    fireEvent(answer, paste);
    fireEvent(answer, drop);
    expect(paste.defaultPrevented).toBe(true);
    expect(drop.defaultPrevented).toBe(true);
    expect(answer).toHaveValue('');
    expect(put).not.toHaveBeenCalled();

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const hidden = createEvent('visibilitychange', document, { cancelable: true });
    const blur = createEvent.blur(window, { cancelable: true });
    fireEvent(document, hidden);
    fireEvent(window, blur);
    expect(hidden.defaultPrevented).toBe(false);
    expect(blur.defaultPrevented).toBe(false);
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toBeEnabled();
    expect(post.mock.calls).toEqual([
      ['/knowledge/attempts/23/integrity', { event_type: 'copy_attempt', detail: 'copy' }],
      ['/knowledge/attempts/23/integrity', { event_type: 'context_menu', detail: 'question_card' }],
      ['/knowledge/attempts/23/integrity', { event_type: 'paste', detail: 'clipboard_paste' }],
      ['/knowledge/attempts/23/integrity', { event_type: 'drop_attempt', detail: 'content_drop' }],
      ['/knowledge/attempts/23/integrity', { event_type: 'page_hidden', detail: 'tab_hidden' }],
      ['/knowledge/attempts/23/integrity', { event_type: 'window_blur', detail: 'window_blur' }],
    ]);
  });

  it('shows integrity metrics to instructors as signals for review', async () => {
    const question = { id: 11, category_id: 1, category_name: 'Computer Literacy', prompt: 'Active monitored prompt?', type: 'true_false',
      options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }], points: 1 };
    const snapshot = { title: 'Active exam', pass_percentage: 80, questions: [question] };
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue(null);
    vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { data: {
      attempt: { id: 23, status: 'completed', completion_reason: 'submitted', completed_at: '2030-01-01T12:00:00Z', certificate_earned: 0, first_name: 'Test', last_name: 'Student' },
      responses: [{ question_id: 11, answer: 'true' }], snapshot,
      integrity: { page_hidden: 2, window_blur: 1, copy_attempt: 1, paste: 0, drop_attempt: 2, context_menu: 0, new_session: 1, total: 7 },
      results: { earned: 1, possible: 1, percentage: 100, level: 'Advanced', categories: [], questions: [{ ...question, answer: 'true', answers: ['true'], correct: true, earned: 1 }] },
    } } });
    render(<AuthContext.Provider value={{ user: { id: 1, role: 'admin', first_name: 'Admin', last_name: 'User' } }}>
      <MemoryRouter initialEntries={['/admin/knowledge/attempts/23']}><Routes>
        <Route path="/admin/knowledge/attempts/:attemptId" element={<KnowledgeAttempt />} />
      </Routes></MemoryRouter>
    </AuthContext.Provider>);
    expect(await screen.findByText('Academic integrity signals')).toBeInTheDocument();
    expect(screen.getByText('7 total flags')).toBeInTheDocument();
    expect(screen.getByText(/review these signals in context/i)).toBeInTheDocument();
    expect(within(screen.getByText('Drop attempts').parentElement).getByText('2')).toBeInTheDocument();
  });
});
