import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import { AuthContext } from '../../contexts/AuthContextStore';
import KnowledgeAssessments from './KnowledgeAssessments';

const now = Date.parse('2030-01-01T12:00:00Z');
const base = { id: 7, title: 'Interrupted assessment', description: 'A saved assessment attempt.', status: 'published',
  question_count: 12, time_limit_minutes: 15, max_attempts: 1, pass_percentage: 80,
  attempt_count: 1, latest_attempt_id: 23, latest_answered_count: 3 };
function renderAssessment(changes) {
  vi.spyOn(api, 'get').mockImplementation(async path => ({ data: { data: path === '/bookmarks' ? { knowledge: [] } : [{ ...base, ...changes }] } }));
  render(<AuthContext.Provider value={{ user: { id: 12, role: 'respondent' } }}>
    <MemoryRouter initialEntries={['/respondent/knowledge']}><Routes>
      <Route path="/respondent/knowledge" element={<KnowledgeAssessments />} />
      <Route path="/respondent/knowledge/attempts/:id" element={<p>Saved attempt opened</p>} />
    </Routes></MemoryRouter>
  </AuthContext.Provider>);
}
const card = async () => within((await screen.findByRole('heading', { name: base.title })).closest('article'));

describe('assessment interruption status', () => {
  beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now); });

  it('resumes an unfinished attempt before its deadline, even when the attempt limit is used', async () => {
    renderAssessment({ latest_status: 'in_progress', latest_deadline: '2030-01-01T12:10:00Z' });
    const assessment = await card();
    expect(assessment.getByText('In progress', { exact: true })).toBeInTheDocument();
    expect(assessment.queryByText('Completed', { exact: true })).not.toBeInTheDocument();
    expect(assessment.getByText('3 of 12 answers saved to the server.')).toBeInTheDocument();
    fireEvent.click(assessment.getByRole('link', { name: 'Resume assessment' }));
    expect(await screen.findByText('Saved attempt opened')).toBeInTheDocument();
  });

  it('shows an expired unfinished attempt with access to its saved work, without offering resume', async () => {
    renderAssessment({ latest_status: 'in_progress', latest_deadline: '2030-01-01T11:59:00Z' });
    const assessment = await card();
    expect(assessment.getByText('Time expired', { exact: true })).toBeInTheDocument();
    expect(assessment.getByText(/timer continued while you were away/)).toBeInTheDocument();
    expect(assessment.queryByRole('link', { name: 'Resume assessment' })).not.toBeInTheDocument();
    expect(assessment.getByRole('link', { name: 'View saved attempt' })).toHaveAttribute('href', '/respondent/knowledge/attempts/23');
  });

  it('keeps an automatically scored timeout visibly different from submitted completion', async () => {
    renderAssessment({ latest_status: 'completed', latest_completion_reason: 'time_expired' });
    const assessment = await card();
    expect(assessment.getByText('Time expired', { exact: true })).toBeInTheDocument();
    expect(assessment.getByRole('link', { name: 'View saved result' })).toBeInTheDocument();
    expect(assessment.getByRole('button', { name: 'Take again' })).toBeDisabled();
    expect(assessment.queryByText('Submitted', { exact: true })).not.toBeInTheDocument();
    expect(assessment.queryByText('Completed', { exact: true })).not.toBeInTheDocument();
  });

  it('labels a genuine submission from its status rather than from the attempt limit', async () => {
    renderAssessment({ latest_status: 'completed', latest_completion_reason: 'submitted', max_attempts: 2 });
    const assessment = await card();
    expect(assessment.getByText('Submitted', { exact: true })).toBeInTheDocument();
    expect(assessment.getByRole('link', { name: 'View result' })).toBeInTheDocument();
    expect(assessment.getByRole('button', { name: 'Take again' })).toBeEnabled();
  });

  it('does not call an exhausted attempt completed when no completion status exists', async () => {
    renderAssessment({ latest_status: null, latest_attempt_id: null });
    const assessment = await card();
    expect(assessment.getByText('Attempt limit reached', { exact: true })).toBeInTheDocument();
    expect(assessment.queryByText('Completed', { exact: true })).not.toBeInTheDocument();
    expect(assessment.queryByText('Submitted', { exact: true })).not.toBeInTheDocument();
    expect(assessment.getByRole('button', { name: 'Take again' })).toBeDisabled();
  });
});
