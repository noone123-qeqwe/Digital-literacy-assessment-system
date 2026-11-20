import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('monitors copy/paste events during an active quiz and shows integrity metrics to instructors', async () => {
    const question = { id: 11, category_id: 1, category_name: 'Computer Literacy', prompt: 'Active monitored prompt?', type: 'true_false',
      options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }], points: 1 };
    const snapshot = { title: 'Active exam', pass_percentage: 80, questions: [question] };
    vi.spyOn(recovery, 'readQuizRecovery').mockResolvedValue(null);
    vi.spyOn(recovery, 'writeQuizRecovery').mockResolvedValue();
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { data: {
      attempt: { id: 23, status: 'in_progress', answers_revision: 0, deadline: new Date(Date.now() + 60000).toISOString() },
      responses: [], snapshot, server_now: new Date().toISOString(), results: null,
    } } });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { recorded: true } } });
    render(<AuthContext.Provider value={{ user: { id: 12, role: 'respondent', first_name: 'Test', last_name: 'Student' } }}>
      <MemoryRouter initialEntries={['/respondent/knowledge/attempts/23']}><Routes>
        <Route path="/respondent/knowledge/attempts/:attemptId" element={<KnowledgeAttempt />} />
      </Routes></MemoryRouter>
    </AuthContext.Provider>);
    const heading = await screen.findByText(/Active monitored prompt/);
    expect(screen.getByText(/Independent work monitoring is active/)).toBeInTheDocument();
    fireEvent.copy(heading);
    expect(post).toHaveBeenCalledWith('/knowledge/attempts/23/integrity', { event_type: 'copy_attempt', detail: 'copy' });

    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { data: {
      attempt: { id: 23, status: 'completed', completion_reason: 'submitted', completed_at: '2030-01-01T12:00:00Z', certificate_earned: 0, first_name: 'Test', last_name: 'Student' },
      responses: [{ question_id: 11, answer: 'true' }], snapshot,
      integrity: { page_hidden: 2, window_blur: 1, copy_attempt: 1, paste: 0, context_menu: 0, new_session: 1, total: 5 },
      results: { earned: 1, possible: 1, percentage: 100, level: 'Advanced', categories: [], questions: [{ ...question, answer: 'true', answers: ['true'], correct: true, earned: 1 }] },
    } } });
    render(<AuthContext.Provider value={{ user: { id: 1, role: 'admin', first_name: 'Admin', last_name: 'User' } }}>
      <MemoryRouter initialEntries={['/admin/knowledge/attempts/23']}><Routes>
        <Route path="/admin/knowledge/attempts/:attemptId" element={<KnowledgeAttempt />} />
      </Routes></MemoryRouter>
    </AuthContext.Provider>);
    expect(await screen.findByText('Academic integrity signals')).toBeInTheDocument();
    expect(screen.getByText('5 total flags')).toBeInTheDocument();
  });
});
