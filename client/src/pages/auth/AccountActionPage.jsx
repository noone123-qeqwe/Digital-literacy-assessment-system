import React, { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PasswordEntry from '../../components/auth/PasswordEntry';

export const AccountActionPage = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const isVerify = location.pathname === '/verify-email';
  const isReset = location.pathname === '/reset-password';
  const isMfaRecovery = location.pathname === '/recover-mfa';
  const title = isVerify ? 'Verify your email' : isReset ? 'Choose a new password' : isMfaRecovery ? 'Recover authenticator access' : 'Reset your password';

  useEffect(() => {
    if ((!isVerify && !isMfaRecovery) || !token) return;
    let active = true;
    api.post(isVerify ? '/auth/verify-email' : '/auth/mfa/recover', { token })
      .then((response) => { if (active) setMessage(response.data.message || 'Email verified. You can sign in.'); })
      .catch((error) => { if (active) setMessage(error.response?.data?.message || 'This verification link is invalid or expired.'); });
    return () => { active = false; };
  }, [isVerify, isMfaRecovery, token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (isVerify) {
        const response = await api.post('/auth/resend-verification', { email });
        setMessage(response.data.message);
      } else if (isMfaRecovery) {
        const response = await api.post('/auth/mfa/recovery-request', { email });
        setMessage(response.data.message);
      } else if (isReset) {
        if (password !== confirmPassword) {
          toast.error('Passwords do not match.');
          return;
        }
        const response = await api.post('/auth/reset-password', { token, new_password: password });
        setMessage(response.data.message);
      } else {
        const response = await api.post('/auth/forgot-password', { email });
        setMessage(response.data.message);
      }
    } catch (error) {
      setMessage(error.response?.data?.message || 'We could not complete that request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const showEmailForm = (isVerify && !token) || (isMfaRecovery && !token) || (!isVerify && !isReset && !isMfaRecovery);
  const showPasswordForm = isReset && Boolean(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-green-700">DLAS Portal · Account security</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 leading-6 text-slate-600">
          {isVerify
            ? token ? 'We are checking your one-time email link.' : 'Enter your email and we will send a fresh verification link if your account needs one.'
            : isMfaRecovery
              ? token ? 'We are resetting privileged authenticator access using this one-time email link.' : 'For administrators and teachers who lost their authenticator, send a one-time recovery link to the account email. MFA must be set up again before signing in.'
            : isReset
              ? token ? 'Your reset link is valid for a limited time. Choose a password with at least 10 characters.' : 'The reset link is missing. Request a new one from the sign-in page.'
              : 'Enter the email address on your account. If it is registered, we will send a one-time password reset link.'}
        </p>

        {showEmailForm && <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-slate-800" htmlFor="account-email">Email address</label>
          <input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 text-slate-900 outline-none focus:border-green-700 focus:bg-white focus:ring-4 focus:ring-green-700/10" />
          <button disabled={busy} className="min-h-12 w-full rounded-xl bg-green-800 px-4 font-semibold text-white hover:bg-green-900 disabled:opacity-60">{busy ? 'Sending…' : isVerify ? 'Send verification link' : isMfaRecovery ? 'Send MFA recovery link' : 'Send reset link'}</button>
        </form>}

        {showPasswordForm && <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <PasswordEntry id="new-password" label="New password" visibilityLabel="new password" value={password} onChange={setPassword} disabled={busy} />
          <PasswordEntry id="confirm-password" label="Confirm new password" visibilityLabel="password confirmation" value={confirmPassword} onChange={setConfirmPassword} disabled={busy} />
          <button disabled={busy} className="min-h-12 w-full rounded-xl bg-green-800 px-4 font-semibold text-white hover:bg-green-900 disabled:opacity-60">{busy ? 'Updating…' : 'Reset password'}</button>
        </form>}

        {message && <p role="status" className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-950">{message}</p>}
        <div className="mt-7 border-t border-slate-200 pt-5 text-sm text-slate-600">
          <Link to="/login" className="font-semibold text-green-800 hover:underline">Return to sign in</Link>
          {!isVerify && !isReset && !isMfaRecovery && <span className="mx-2">·</span>}
          {!isVerify && !isReset && !isMfaRecovery && <Link to="/verify-email" className="font-semibold text-green-800 hover:underline">Verify email</Link>}
        </div>
      </section>
    </main>
  );
};

export default AccountActionPage;
