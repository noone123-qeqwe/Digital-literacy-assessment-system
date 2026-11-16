import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import api from '../api/axios';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';

it('keeps a verified session when an older initial signed-out check finishes late', async () => {
  let rejectInitial;
  const initial = new Promise((resolve, reject) => { rejectInitial = reject; });
  let sessionReads = 0;
  vi.spyOn(api, 'get').mockImplementation(path => {
    if (path === '/auth/me') {
      sessionReads++;
      return sessionReads === 1 ? initial : Promise.resolve({ data: { success: true, data: { id: 12, role: 'respondent', email_verified: 1 } } });
    }
    return Promise.reject({ response: { status: 404 } });
  });
  function Session() {
    const { user, loading, refreshUser } = useAuth();
    return <>
      <p>{user ? 'Verified student session' : 'Signed out'}</p>
      <p>{loading ? 'Checking session' : 'Session ready'}</p>
      <button onClick={() => void refreshUser()}>Refresh verified session</button>
    </>;
  }
  render(<AuthProvider><Session /></AuthProvider>);
  await waitFor(() => expect(sessionReads).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh verified session' }));
  await screen.findByText('Verified student session');
  await act(async () => { rejectInitial({ response: { status: 401 } }); });
  await screen.findByText('Session ready');
  expect(screen.getByText('Verified student session')).toBeInTheDocument();
});
