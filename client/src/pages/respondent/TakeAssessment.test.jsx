import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import { AuthContext } from '../../contexts/AuthContextStore';
import * as queue from '../../utils/offlineResponseQueue';
import TakeAssessment from './TakeAssessment';

describe('TakeAssessment offline batch sync & Part III discoverability', () => {
  it('batches queued answers into one PUT /respond request and exposes Part III in the Review modal', async () => {
    let queuedItems = [
      { key: '1:50:101', userId: 1, assessmentId: 7, attemptId: 50, questionId: 101, rating: 3, revision: 10 },
      { key: '1:50:102', userId: 1, assessmentId: 7, attemptId: 50, questionId: 102, rating: 4, revision: 11 },
    ];
    vi.spyOn(queue, 'loadAttemptCheckpoint').mockResolvedValue(null);
    vi.spyOn(queue, 'requestPersistentLocalStorage').mockResolvedValue({ supported: true, persisted: true });
    vi.spyOn(queue, 'saveAttemptCheckpoint').mockResolvedValue({});
    vi.spyOn(queue, 'listQueuedResponses').mockImplementation(async () => [...queuedItems]);
    vi.spyOn(queue, 'markCheckpointResponsesSynced').mockResolvedValue(new Set([101, 102]));
    vi.spyOn(queue, 'removeQueuedResponses').mockImplementation(async (records) => {
      const removed = new Set(records.map((r) => r.questionId));
      queuedItems = queuedItems.filter((item) => !removed.has(item.questionId));
      return removed;
    });
    vi.spyOn(queue, 'saveAttemptDraftField').mockResolvedValue(true);

    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        data: {
          attempt: { id: 50, status: 'in_progress', desired_skills: '' },
          assessment: { id: 7, title: 'Freshman Digital Literacy Survey', scoring_version: 'digcomp-1-4' },
          questions: [
            { id: 101, question_number: 1, area_code: 'IDL', area_name: 'Information and Data Literacy', question_text: 'Question 1', saved_rating: 3 },
            { id: 102, question_number: 2, area_code: 'CC', area_name: 'Communication and Collaboration', question_text: 'Question 2', saved_rating: 4 },
          ],
        },
      },
    });
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } });

    render(
      <AuthContext.Provider value={{ user: { id: 1, role: 'respondent' } }}>
        <MemoryRouter initialEntries={['/respondent/assessments/7/take']}>
          <Routes>
            <Route path="/respondent/assessments/:id/take" element={<TakeAssessment />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    await waitFor(() => expect(putSpy).toHaveBeenCalledWith('/attempts/50/respond', {
      responses: [
        { question_id: 101, rating: 3 },
        { question_id: 102, rating: 4 },
      ],
    }));
    expect(putSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Review and submit/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Answer Part III/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Answer Part III/i }));
    await waitFor(() => expect(screen.getByLabelText(/Digital skills you would like to develop/i)).toBeInTheDocument());
  });
});
