import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import { AuthContext } from '../../contexts/AuthContextStore';
import { DemoModeContext } from '../../contexts/DemoModeContextStore';
import { emitCertificateSync } from '../../utils/certificateEvents';
import KnowledgeRecords from './KnowledgeRecords';

function renderCertificates(user = { id: 12, role: 'respondent', first_name: 'Maria', last_name: 'Santos' }) {
  return render(
    <AuthContext.Provider value={{ user }}>
      <DemoModeContext.Provider value={{ available: true, freeDemoReadOnly: false, loading: false }}>
        <MemoryRouter>
          <KnowledgeRecords mode="certificates" />
        </MemoryRouter>
      </DemoModeContext.Provider>
    </AuthContext.Provider>
  );
}

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('My Certificates lock and unlock collection', () => {
  const unlockedQuiz = {
    key: 'knowledge:quiz:1',
    instrument: 'knowledge',
    scoring_version: 'knowledge-achievement',
    certificate_title: 'Certificate of Achievement',
    assessment_id: 1,
    assessment_title: 'Digital Literacy Foundations — Baseline',
    unlocked: true,
    status: 'unlocked',
    completion_status: 'completed',
    completion_label: 'Completed',
    attempt_id: 42,
    recipient_name: 'Maria Santos',
    first_name: 'Maria',
    last_name: 'Santos',
    percentage: 91,
    level: 'Advanced',
    pass_percentage: 80,
    issued_at: '2030-03-10T10:00:00Z',
    reference_code: 'MC-KQ-0000042',
    download_url: '/knowledge/attempts/42/export/certificate',
    result_path: '/respondent/knowledge/attempts/42',
    assessment_path: '/respondent/knowledge',
  };

  const lockedResearch = {
    key: 'research:assessment:5',
    instrument: 'research',
    scoring_version: 'dlas-mean-1.0',
    certificate_title: 'Certificate of Completion',
    assessment_id: 5,
    assessment_title: 'Digital Literacy Survey 2026',
    unlocked: false,
    status: 'locked',
    completion_status: 'not_started',
    completion_label: 'Not started',
    locked_reason: 'Complete the required assessment to unlock this certificate.',
    attempt_id: null,
    issued_at: null,
    reference_code: null,
    download_url: null,
    assessment_path: '/respondent/assessments/5/take',
    action_label: 'Take assessment',
    exhausted: false,
    future: false,
  };

  it('displays both unlocked and locked certificates while blocking preview/download on locked items', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        data: {
          items: [unlockedQuiz, lockedResearch],
          summary: { total: 2, unlocked: 1, locked: 1 },
        },
      },
    });

    renderCertificates();

    expect(await screen.findByText('1 of 2 certificates unlocked')).toBeInTheDocument();

    const unlockedCard = screen.getByRole('heading', { name: 'Certificate of Achievement' }).closest('article');
    expect(within(unlockedCard).getByText('Unlocked', { exact: true })).toBeInTheDocument();
    expect(within(unlockedCard).getByText('MC-KQ-0000042')).toBeInTheDocument();
    expect(within(unlockedCard).getByRole('button', { name: 'Preview' })).toBeEnabled();
    expect(within(unlockedCard).getByRole('button', { name: 'Download PDF' })).toBeEnabled();

    const lockedCard = screen.getByRole('heading', { name: 'Certificate of Completion' }).closest('article');
    expect(lockedCard).toHaveClass('cert-card--locked');
    expect(within(lockedCard).getByText('Complete the required assessment to unlock this certificate.')).toBeInTheDocument();
    expect(within(lockedCard).getByRole('button', { name: 'Locked' })).toBeDisabled();
    expect(within(lockedCard).queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument();
    expect(within(lockedCard).queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    expect(within(lockedCard).getByRole('link', { name: /Take assessment/i })).toHaveAttribute('href', '/respondent/assessments/5/take');

    // Unlocked preview modal works cleanly
    fireEvent.click(within(unlockedCard).getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
  });

  it('automatically transitions a certificate from locked to unlocked when database completion sync fires without page reload', async () => {
    let completedInDb = false;
    vi.spyOn(api, 'get').mockImplementation(async () => ({
      data: {
        data: completedInDb
          ? {
              items: [
                unlockedQuiz,
                {
                  ...lockedResearch,
                  unlocked: true,
                  status: 'unlocked',
                  completion_status: 'completed',
                  completion_label: 'Completed',
                  attempt_id: 99,
                  recipient_name: 'Maria Santos',
                  first_name: 'Maria',
                  last_name: 'Santos',
                  issued_at: '2030-03-11T09:30:00Z',
                  reference_code: 'MC-DLA-0000099',
                  download_url: '/export/awards/99/pdf',
                  result_path: '/respondent/assessments/99/results',
                },
              ],
              summary: { total: 2, unlocked: 2, locked: 0 },
            }
          : {
              items: [unlockedQuiz, lockedResearch],
              summary: { total: 2, unlocked: 1, locked: 1 },
            },
      },
    }));

    renderCertificates();

    expect(await screen.findByText('1 of 2 certificates unlocked')).toBeInTheDocument();

    // Emitting sync alone before DB completion keeps it locked
    emitCertificateSync({ instrument: 'research', unlocked: true });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.getByText('1 of 2 certificates unlocked')).toBeInTheDocument();

    // Once DB marks assessment completed, sync updates immediately without page refresh
    completedInDb = true;
    emitCertificateSync({ instrument: 'research', assessmentId: 5, attemptId: 99, unlocked: true });

    expect(await screen.findByText('2 of 2 certificates unlocked')).toBeInTheDocument();
    const newlyUnlockedCard = screen.getByRole('heading', { name: 'Certificate of Completion' }).closest('article');
    expect(newlyUnlockedCard).toHaveClass('cert-card--unlocked');
    expect(newlyUnlockedCard).toHaveClass('cert-card--just-unlocked');
    expect(within(newlyUnlockedCard).getByText('Newly unlocked')).toBeInTheDocument();
    expect(within(newlyUnlockedCard).getByText('MC-DLA-0000099')).toBeInTheDocument();
    expect(within(newlyUnlockedCard).getByRole('button', { name: 'Download PDF' })).toBeEnabled();
  });

  it('filters cards between All certificates, Unlocked, and Locked tabs', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        data: {
          items: [unlockedQuiz, lockedResearch],
          summary: { total: 2, unlocked: 1, locked: 1 },
        },
      },
    });

    renderCertificates();
    await screen.findByText('1 of 2 certificates unlocked');

    fireEvent.click(screen.getByRole('button', { name: /^Locked\s*1$/i }));
    expect(screen.queryByRole('heading', { name: 'Certificate of Achievement' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Certificate of Completion' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Unlocked\s*1$/i }));
    expect(screen.getByRole('heading', { name: 'Certificate of Achievement' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Certificate of Completion' })).not.toBeInTheDocument();
  });
});
