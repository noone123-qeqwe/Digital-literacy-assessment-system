import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { AuthContext } from '../../contexts/AuthContextStore';
import * as recovery from '../../utils/quizRecovery';
import KnowledgeAttempt from './KnowledgeAttempt';

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
  render(<AuthContext.Provider value={{ user: { id: 12, role: 'respondent', first_name: 'Test', last_name: 'Student' } }}>
    <MemoryRouter initialEntries={['/respondent/knowledge/attempts/23']}><Routes>
      <Route path="/respondent/knowledge/attempts/:attemptId" element={<KnowledgeAttempt />} />
    </Routes></MemoryRouter>
  </AuthContext.Provider>);
  return post;
}

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
});
