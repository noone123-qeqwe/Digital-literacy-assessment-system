import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react';
import api from '../../api/axios';
import PasswordEntry from '../../components/auth/PasswordEntry';
import './AccountActionPage.css';

const inlineFeedback = { suppressErrorToast: true };

function errorFeedback(error) {
  const status = error.response?.status;
  if (status >= 500) return { tone: 'error', status, text: 'The account service is temporarily unavailable. Your entries are still in this form. Please try again shortly.' };
  if (!error.response) return { tone: 'error', text: 'Check your connection and try again. Your entries are still in this form.' };
  return { tone: 'error', status, text: error.response.data?.message || 'We could not complete that request. Please try again.' };
}

function AccountActionForm({ pathname, token, initialEmail }) {
  const isVerify = pathname === '/verify-email';
  const isReset = pathname === '/reset-password';
  const isMfaRecovery = pathname === '/recover-mfa';
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(Boolean((isVerify || isMfaRecovery) && token));
  const [feedback, setFeedback] = useState(null);
  const [completed, setCompleted] = useState(false);
  const submissionLock = useRef(false);
  const linkRequest = useRef(null);

  const title = isVerify ? 'Verify your email' : isReset ? completed ? 'Password updated' : 'Set a new password' : isMfaRecovery ? 'Recover authenticator access' : 'Reset your password';
  const description = isVerify
    ? token ? 'Confirm your email to continue to your account.' : 'Request a fresh verification link for your account.'
    : isMfaRecovery
      ? token ? 'We are checking your one-time recovery link.' : 'Enter your account email to request a recovery link.'
      : isReset
        ? completed ? 'You can now sign in with your new password.' : token ? 'Use 10–128 characters.' : 'The reset link is missing. Request a new one to continue.'
        : 'Enter your account email to receive a reset link.';

  useEffect(() => {
    if ((!isVerify && !isMfaRecovery) || !token) return undefined;
    let active = true;
    if (!linkRequest.current) linkRequest.current = api.post(isVerify ? '/auth/verify-email' : '/auth/mfa/recover', { token }, inlineFeedback);
    linkRequest.current
      .then(response => { if (active) setFeedback({ tone: 'success', text: response.data.message || 'Your link has been confirmed. You can sign in.' }); })
      .catch(error => { if (active) setFeedback(errorFeedback(error)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [isVerify, isMfaRecovery, token]);

  const handleSubmit = async event => {
    event.preventDefault();
    if (submissionLock.current || busy) return;
    if (isReset && password !== confirmPassword) {
      setFeedback({ tone: 'error', field: 'confirm-password', text: 'Passwords do not match.' });
      document.getElementById('confirm-password')?.focus();
      return;
    }
    submissionLock.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const endpoint = isVerify ? '/auth/resend-verification' : isMfaRecovery ? '/auth/mfa/recovery-request' : isReset ? '/auth/reset-password' : '/auth/forgot-password';
      const response = await api.post(endpoint, isReset ? { token, new_password: password } : { email }, inlineFeedback);
      setFeedback({ tone: 'success', text: response.data.message || 'Your request was completed.' });
      if (isReset) { setCompleted(true); setPassword(''); setConfirmPassword(''); }
    } catch (error) {
      setFeedback(errorFeedback(error));
    } finally {
      submissionLock.current = false;
      setBusy(false);
    }
  };

  const showEmailForm = (isVerify && !token) || (isMfaRecovery && !token) || (!isVerify && !isReset && !isMfaRecovery);
  const showPasswordForm = isReset && Boolean(token) && !completed;
  const showNewLink = Boolean(token && feedback?.tone === 'error' && feedback.status === 400 && /invalid|expired/i.test(feedback.text));
  const newLinkPath = isReset ? '/forgot-password' : isVerify ? '/verify-email' : '/recover-mfa';
  const updatePassword = value => { setPassword(value); setFeedback(null); };
  const updateConfirmation = value => { setConfirmPassword(value); setFeedback(null); };

  return <main className="account-action-page">
    <section className="account-action-card" aria-labelledby="account-action-title">
      <header className="account-action-header">
        <p className="account-action-eyebrow">DLAS Portal · Account security</p>
        <h1 id="account-action-title">{title}</h1>
        <p id="account-action-description" className="account-action-description">{description}</p>
      </header>

      {busy && !showEmailForm && !showPasswordForm && <p role="status" className="account-action-progress"><LoaderCircle size={18} aria-hidden="true" />Checking your link…</p>}

      {showEmailForm && <form className="account-action-form" onSubmit={handleSubmit} aria-busy={busy} aria-describedby="account-action-description">
        <div className="account-email-field">
          <label htmlFor="account-email">Email address</label>
          <input id="account-email" name="email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={event => { setEmail(event.target.value); setFeedback(null); }} className="account-action-input" />
        </div>
        <button type="submit" disabled={busy} className="account-action-primary">{busy && <LoaderCircle size={17} aria-hidden="true" />}{busy ? 'Sending…' : isVerify ? 'Send verification link' : isMfaRecovery ? 'Send MFA recovery link' : 'Send reset link'}</button>
      </form>}

      {showPasswordForm && <form className="account-action-form" onSubmit={handleSubmit} aria-busy={busy} aria-describedby="account-action-description">
        <PasswordEntry id="new-password" label="New password" visibilityLabel="new password" value={password} onChange={updatePassword} disabled={busy} describedBy="account-action-description" />
        <PasswordEntry id="confirm-password" label="Confirm password" visibilityLabel="password confirmation" value={confirmPassword} onChange={updateConfirmation} disabled={busy} invalid={feedback?.field === 'confirm-password'} describedBy={feedback?.field === 'confirm-password' ? 'account-action-feedback' : 'account-action-description'} />
        <button type="submit" disabled={busy} className="account-action-primary">{busy && <LoaderCircle size={17} aria-hidden="true" />}{busy ? 'Updating…' : 'Reset password'}</button>
      </form>}

      {feedback && <div id="account-action-feedback" role={feedback.tone === 'error' ? 'alert' : 'status'} aria-atomic="true" className={'account-action-notice account-action-notice--' + feedback.tone}>
        {feedback.tone === 'error' ? <CircleAlert size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
        <div><p>{feedback.text}</p>{showNewLink && <Link to={newLinkPath}>Request a new link</Link>}</div>
      </div>}

      {isReset && !token && <Link to="/forgot-password" className="account-action-primary account-action-next">Request a new reset link</Link>}
      {isReset && completed && <Link to="/login" className="account-action-primary account-action-next">Sign in</Link>}

      <footer className="account-action-footer">
        <Link to="/login"><ArrowLeft size={15} aria-hidden="true" />Return to sign in</Link>
        {!isVerify && !isReset && !isMfaRecovery && <Link to="/verify-email">Verify email</Link>}
      </footer>
    </section>
  </main>;
}

export const AccountActionPage = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const token = searchParams.get('token');
  const initialEmail = searchParams.get('email') || '';
  return <AccountActionForm key={pathname + ':' + (token || '') + ':' + initialEmail} pathname={pathname} token={token} initialEmail={initialEmail} />;
};

export default AccountActionPage;
