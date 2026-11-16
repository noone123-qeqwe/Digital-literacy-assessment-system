import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import { AuthContext } from '../../contexts/AuthContextStore';
import AccountActionPage from './AccountActionPage';

describe('AccountActionPage email verification redirect', () => {
  it('redirects automatically to the student dashboard after verifying email', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        signedIn: true,
        message: 'Email verified. Redirecting to your dashboard…',
        data: { user: { id: 12, role: 'respondent' } },
      },
    });
    const refreshUser = vi.fn().mockResolvedValue({ id: 12, role: 'respondent', email_verified: 1 });

    render(
      <AuthContext.Provider value={{ user: null, refreshUser }}>
        <MemoryRouter initialEntries={['/verify-email?token=valid-student-token-1234567890']}>
          <Routes>
            <Route path="/verify-email" element={<AccountActionPage />} />
            <Route path="/respondent/dashboard" element={<div>Student Dashboard Landing</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    await waitFor(() => expect(screen.getByText('Student Dashboard Landing')).toBeInTheDocument());
    expect(postSpy).toHaveBeenCalledWith(
      '/auth/verify-email',
      { token: 'valid-student-token-1234567890' },
      { suppressErrorToast: true }
    );
    expect(refreshUser).toHaveBeenCalledWith({ suppressSessionRedirect: true, suppressErrorToast: true });
  });

  it('stays on confirmation screen with Sign in link when MFA is still required', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        signedIn: false,
        message: 'Email verified. Sign in to complete two-step verification.',
      },
    });
    const refreshUser = vi.fn();

    render(
      <AuthContext.Provider value={{ user: null, refreshUser }}>
        <MemoryRouter initialEntries={['/verify-email?token=valid-staff-token-1234567890']}>
          <Routes>
            <Route path="/verify-email" element={<AccountActionPage />} />
            <Route path="/respondent/dashboard" element={<div>Student Dashboard Landing</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    await waitFor(() => expect(screen.getByText(/Sign in to complete two-step verification/i)).toBeInTheDocument());
    expect(screen.queryByText('Student Dashboard Landing')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Sign in$/i })).toBeInTheDocument();
    expect(refreshUser).not.toHaveBeenCalled();
  });
});
