import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import { AuthContext } from '../../contexts/AuthContextStore';
import KnowledgeRecords from './KnowledgeRecords';

describe('assessment result history', () => {
  it('retains timed-out scores with the expiry reason and saved-answer count', async () => {
    const timedOut = { id: 23, quiz_id: 7, title: 'Interrupted quiz', completion_reason: 'time_expired',
      answered_count: 3, question_count: 12, percentage: 25, level: 'Needs Improvement', completed_at: '2030-01-01T12:00:00Z' };
    vi.spyOn(api, 'get').mockImplementation(async path => ({ data: { data: path === '/knowledge/overview'
      ? { history: [timedOut], totalHistory: 1 } : [] } }));
    render(<AuthContext.Provider value={{ user: { id: 12, role: 'respondent' } }}>
      <MemoryRouter><KnowledgeRecords /></MemoryRouter>
    </AuthContext.Provider>);
    expect(await screen.findByRole('heading', { name: 'Assessment result history' })).toBeInTheDocument();
    expect(screen.getByText('Time ended before submission. 3 of 12 answers were saved.')).toBeInTheDocument();
    expect(screen.getByText('Time expired', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Completed assessment history' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'View result' })).toHaveLength(2);
  });
});
