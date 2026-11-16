import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import { AuthContext } from '../../contexts/AuthContextStore';
import LearningHub from './LearningHub';

describe('LearningHub', () => {
  it('uses / 3 scale for DigCompSAT and falls back to all areas when weakest area has no modules', async () => {
    const getSpy = vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/learning/modules') {
        return Promise.resolve({
          data: {
            data: [
              {
                id: 10,
                competence_area_id: 1,
                area_code: 'IDL',
                area_name: 'Information and Data Literacy',
                title: 'Evaluating Online Sources',
                description: 'Verify claims and check source credibility.',
                resource_url: 'https://example.test/idl',
                estimated_minutes: 20,
                completed: 0,
                is_published: 1,
              },
              {
                id: 11,
                competence_area_id: 2,
                area_code: 'CC',
                area_name: 'Communication and Collaboration',
                title: 'Digital Etiquette Guide',
                description: 'Collaborate effectively online.',
                resource_url: 'https://example.test/cc',
                estimated_minutes: 15,
                completed: 1,
                completed_at: '2026-10-01T00:00:00Z',
                is_published: 1,
              },
            ],
          },
        });
      }
      if (url === '/attempts/my?include=learning_summary') {
        return Promise.resolve({
          data: {
            data: [
              {
                id: 99,
                status: 'completed',
                completed_at: '2026-11-01T00:00:00Z',
                learning_summary: {
                  attempt: {
                    id: 99,
                    assessment_title: 'DigCompSAT Baseline',
                    scoring_version: 'digcompsat-self-reflection-0-3.1',
                  },
                  areaResults: [
                    { area_code: 'S', area_name: 'Safety', weighted_mean: 1.4 },
                    { area_code: 'IDL', area_name: 'Information and Data Literacy', weighted_mean: 2.3 },
                  ],
                  responses: [],
                },
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    render(
      <AuthContext.Provider value={{ user: { id: 5, role: 'respondent' } }}>
        <MemoryRouter>
          <LearningHub />
        </MemoryRouter>
      </AuthContext.Provider>
    );

    await waitFor(() => expect(screen.getByText(/Evaluating Online Sources/i)).toBeInTheDocument());
    expect(screen.getByText(/1\.40 \/ 3/i)).toBeInTheDocument();
    expect(screen.getByText(/Digital Etiquette Guide/i)).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 completed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Information and Data Literacy \(1\)/i }));
    expect(screen.getByText(/Evaluating Online Sources/i)).toBeInTheDocument();
    expect(screen.queryByText(/Digital Etiquette Guide/i)).not.toBeInTheDocument();

    getSpy.mockRestore();
  });
});
