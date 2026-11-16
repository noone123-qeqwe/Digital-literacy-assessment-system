import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../contexts/AuthContextStore';
import { DemoModeContext } from '../../contexts/DemoModeContextStore';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';

function renderWithAuth(ui, authOverrides = {}, initialEntries = ['/']) {
  sessionStorage.setItem('dlas:login-intro:seen:v1', '1');
  const authValue = {
    user: null,
    loading: false,
    profilePictureUrl: '',
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    completeMfaLogin: vi.fn(),
    resendMfaOtp: vi.fn(),
    beginMfaSetup: vi.fn(),
    completeMfaSetup: vi.fn(),
    ...authOverrides,
  };
  const demoValue = {
    available: false,
    demoMode: false,
    freeDemoReadOnly: false,
    loading: false,
  };

  return {
    authValue,
    ...render(
      <AuthContext.Provider value={authValue}>
        <DemoModeContext.Provider value={demoValue}>
          <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
        </DemoModeContext.Provider>
      </AuthContext.Provider>
    ),
  };
}

describe('LoginPage', () => {
  it('hides the backup scratch code button when the user has no backup codes', async () => {
    const login = vi.fn().mockResolvedValue({
      success: false,
      mfaRequired: true,
      challengeId: 'challenge-1',
      maskedEmail: 'a***n@dlas.edu.ph',
      methods: { emailOtp: true, totp: false, backupCode: false },
    });

    renderWithAuth(<LoginPage />, { login }, ['/login']);

    fireEvent.change(screen.getByLabelText(/Email address/i), { target: { value: 'admin@dlas.edu.ph' } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'AdminPass123!' } });
    fireEvent.submit(screen.getByRole('button', { name: /Sign in/i }).closest('form'));

    await waitFor(() => expect(screen.getByRole('heading', { name: /Verify your sign-in/i })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Use backup scratch code/i })).not.toBeInTheDocument();
  });

  it('shows the backup scratch code toggle when backup codes are available and passes silentErrorToast', async () => {
    const login = vi.fn().mockResolvedValue({
      success: false,
      mfaRequired: true,
      challengeId: 'challenge-2',
      maskedEmail: 'a***n@dlas.edu.ph',
      methods: { emailOtp: true, totp: true, backupCode: true },
    });

    renderWithAuth(<LoginPage />, { login }, ['/login']);

    fireEvent.change(screen.getByLabelText(/Email address/i), { target: { value: 'admin@dlas.edu.ph' } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'AdminPass123!' } });
    fireEvent.submit(screen.getByRole('button', { name: /Sign in/i }).closest('form'));

    await waitFor(() => expect(screen.getByRole('button', { name: /Use backup scratch code/i })).toBeInTheDocument());
    expect(login).toHaveBeenCalledWith('admin@dlas.edu.ph', 'AdminPass123!', { silentErrorToast: true });
  });
});

describe('RegisterPage', () => {
  it('avoids duplicate password errors and premature confirm-password validation before submit', async () => {
    const register = vi.fn().mockResolvedValue({ success: true, verificationRequired: true });
    renderWithAuth(<RegisterPage />, { register }, ['/register']);

    const passwordInput = screen.getByLabelText(/^Password$/i);
    const confirmInput = screen.getByLabelText(/^Confirm password$/i);

    fireEvent.focus(confirmInput);
    fireEvent.blur(confirmInput);
    expect(screen.queryByText(/Confirm your password/i)).not.toBeInTheDocument();

    fireEvent.change(passwordInput, { target: { value: 'short' } });
    fireEvent.blur(passwordInput);
    expect(screen.getByText(/Use at least 10 characters\./i)).toBeInTheDocument();
    expect(screen.queryByText(/^At least 10 characters/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/First name/i), { target: { value: 'Juan' } });
    fireEvent.change(screen.getByLabelText(/Last name/i), { target: { value: 'Dela Cruz' } });
    fireEvent.change(screen.getByLabelText(/Email address/i), { target: { value: 'juan@example.test' } });
    fireEvent.change(passwordInput, { target: { value: 'StrongPassword123!' } });
    fireEvent.change(confirmInput, { target: { value: 'StrongPassword123!' } });

    fireEvent.submit(screen.getByRole('button', { name: /Create account/i }).closest('form'));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Check your inbox/i })).toBeInTheDocument());
  });
});
