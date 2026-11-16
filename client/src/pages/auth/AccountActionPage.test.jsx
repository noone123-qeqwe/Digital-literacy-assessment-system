import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import { AuthContext } from '../../contexts/AuthContextStore';
import { AuthProvider } from '../../contexts/AuthContext';
import { useAuth } from '../../contexts/useAuth';
import AccountActionPage from './AccountActionPage';

describe('AccountActionPage email verification redirect', () => {
  it('refreshes the real auth provider once and reaches an authenticated dashboard', async () => {
    let verified = false;
    const student = { id: 12, role: 'respondent', email_verified: 1 };
    const postSpy = vi.spyOn(api, 'post').mockImplementation(async () => {
      verified = true;
      return { data: { success: true, signedIn: true, data: { user: student } } };
    });
    const getSpy = vi.spyOn(api, 'get').mockImplementation(async path => {
      await new Promise(resolve => setTimeout(resolve, 5));
      if (path === '/auth/me' && verified) {
        return { data: { success: true, data: { ...student } } };
      }
      throw { response: { status: path === '/auth/me' ? 401 : 404 } };
    });
    function Dashboard() {
      const { user } = useAuth();
      return user?.role === 'respondent' ? <p>Authenticated Student Dashboard</p> : <p>No session</p>;
    }
    render(<React.StrictMode><AuthProvider>
      <MemoryRouter initialEntries={['/verify-email?token=fixture-real-provider-1234567890']}>
        <Routes>
          <Route path="/verify-email" element={<AccountActionPage />} />
          <Route path="/respondent/dashboard" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider></React.StrictMode>);
    await screen.findByText('Authenticated Student Dashboard');
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(getSpy.mock.calls.filter(([path]) => path === '/auth/me').length).toBeLessThanOrEqual(3);
  });

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

  it('offers sign-in instead of claiming dashboard access when the session cannot be read', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true, signedIn: true, data: { user: { id: 12, role: 'respondent' } } } });
    const refreshUser = vi.fn().mockResolvedValue(null);
    render(<AuthContext.Provider value={{ user: null, refreshUser }}>
      <MemoryRouter initialEntries={['/verify-email?token=fixture-session-unavailable-12345']}>
        <Routes>
          <Route path="/verify-email" element={<AccountActionPage />} />
          <Route path="/respondent/dashboard" element={<p>Student Dashboard Landing</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>);
    await screen.findByText(/Your email is verified. We could not finish signing you in/);
    expect(screen.getByRole('link', { name: /^Sign in$/i })).toBeInTheDocument();
    expect(screen.queryByText('Student Dashboard Landing')).not.toBeInTheDocument();
  });
});
