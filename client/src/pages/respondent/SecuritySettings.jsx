import React, { useCallback, useEffect, useState } from 'react';
import { Laptop, ShieldCheck, Smartphone, Trash2, Lock, RefreshCw, KeyRound, Copy, Download, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../contexts/useAuth';
import PageHeader from '../../components/common/PageHeader';

function deviceName(userAgent = '') {
  if (/Edg\//.test(userAgent)) return 'Microsoft Edge';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Chrome\//.test(userAgent)) return 'Google Chrome';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return userAgent ? 'Browser session' : 'Unknown device';
}

function formatSessionDate(value) {
  const date = new Date(String(value).replace(' ', 'T') + (/[zZ]|[+-]\d\d:\d\d$/.test(value) ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
}

export const SecuritySettings = () => {
  const { user, changePassword, refreshUser } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });

  // Optional Authenticator (TOTP) + Backup Scratch Codes state
  const [totpSetup, setTotpSetup] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);
  const [disableTotpPassword, setDisableTotpPassword] = useState('');
  const [showDisableTotp, setShowDisableTotp] = useState(false);

  const [backupCodes, setBackupCodes] = useState(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  const isStaff = user?.role === 'admin';

  const refreshSessions = useCallback(async () => {
    try {
      const response = await api.get('/auth/sessions');
      setSessions(response.data.data || []);
    } catch {
      toast.error('Unable to load active sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadSessions = async () => {
      try {
        const response = await api.get('/auth/sessions');
        if (active) setSessions(response.data.data || []);
      } catch {
        if (active) toast.error('Unable to load active sessions.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadSessions();
    return () => { active = false; };
  }, []);

  const revoke = async (session) => {
    setBusyId(session.id);
    try {
      await api.delete(`/auth/sessions/${encodeURIComponent(session.id)}`);
      toast.success(session.is_current ? 'This session has been signed out.' : 'Device session signed out.');
      if (session.is_current) window.location.assign('/login');
      else await refreshSessions();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to sign out this device.');
    } finally {
      setBusyId('');
    }
  };

  const updatePassword = async (event) => {
    event.preventDefault();
    if (password.next !== password.confirm) return toast.error('New passwords do not match.');
    if (password.next.length < 10) return toast.error('Use at least 10 characters for your new password.');
    const result = await changePassword(password.current, password.next);
    if (result.success) setPassword({ current: '', next: '', confirm: '' });
  };

  const startTotpSetup = async () => {
    setTotpBusy(true);
    try {
      const response = await api.post('/auth/mfa/totp/setup');
      if (response.data.success) {
        setTotpSetup(response.data.data);
        setTotpCode('');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not start authenticator setup.');
    } finally {
      setTotpBusy(false);
    }
  };

  const confirmTotpSetup = async (event) => {
    event.preventDefault();
    setTotpBusy(true);
    try {
      const response = await api.post('/auth/mfa/totp/confirm', { code: totpCode });
      if (response.data.success) {
        toast.success(response.data.message || 'Authenticator app enabled.');
        setTotpSetup(null);
        setTotpCode('');
        if (response.data.data?.backup_codes?.length) {
          setBackupCodes(response.data.data.backup_codes);
        }
        await refreshUser();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification code was not accepted.');
    } finally {
      setTotpBusy(false);
    }
  };

  const disableTotp = async (event) => {
    event.preventDefault();
    setTotpBusy(true);
    try {
      const response = await api.delete('/auth/mfa/totp', { data: { current_password: disableTotpPassword } });
      if (response.data.success) {
        toast.success(response.data.message || 'Authenticator app disabled.');
        setDisableTotpPassword('');
        setShowDisableTotp(false);
        await refreshUser();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not disable authenticator app.');
    } finally {
      setTotpBusy(false);
    }
  };

  const regenerateBackupCodes = async (event) => {
    event.preventDefault();
    setBackupBusy(true);
    try {
      const response = await api.post('/auth/mfa/backup-codes/regenerate', { current_password: backupPassword });
      if (response.data.success) {
        setBackupCodes(response.data.data.backup_codes || []);
        setBackupPassword('');
        setShowBackupPrompt(false);
        toast.success('Fresh backup scratch codes generated.');
        await refreshUser();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not generate backup scratch codes.');
    } finally {
      setBackupBusy(false);
    }
  };

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard.`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const downloadBackupCodes = () => {
    if (!backupCodes?.length) return;
    const content = [
      'Digital Literacy Assessment System (DLAS) — Backup Scratch Codes',
      `Account: ${user?.email || ''}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      'Each code can be used once to sign in if email or authenticator access is unavailable:',
      ...backupCodes.map((code, index) => `${index + 1}. ${code}`),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dlas-backup-scratch-codes.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="security-settings mx-auto w-full max-w-6xl space-y-7 pb-10">
      <PageHeader title="Security & sessions" description="Manage your password, two-step verification, backup codes, and active devices." />

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-green-50 p-3 text-green-800"><ShieldCheck aria-hidden="true" className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-950">Sign-in protections</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Account: <span className="security-account-email font-medium text-slate-800">{user?.email}</span></p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user?.email_verified ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>{user?.email_verified ? 'Email verified' : 'Email verification required'}</span>
              {isStaff && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user?.mfa_required === false ? 'bg-slate-100 text-slate-700' : 'bg-green-100 text-green-800'}`}>
                  {user?.mfa_required === false ? 'Email 6-digit OTP optional' : 'Email 6-digit OTP active'}
                </span>
              )}
              {isStaff && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user?.mfa_enabled ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
                  {user?.mfa_enabled ? 'Authenticator app enabled' : 'Authenticator app optional'}
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Session expires automatically</span>
            </div>
          </div>
        </div>
      </section>

      {isStaff && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 space-y-6">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
              <KeyRound aria-hidden="true" className="h-5 w-5 text-green-700" /> Two-step verification &amp; backup scratch codes
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Sign-ins are protected with a 6-digit verification code sent to your email. You can also add an authenticator app and save one-time backup scratch codes.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Primary Email OTP + Optional TOTP Card */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Mail aria-hidden="true" className="h-5 w-5 text-green-700" />
                  <h3 className="text-sm font-bold text-slate-900">Email OTP &amp; Authenticator App (TOTP)</h3>
                </div>
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-800">
                  {user?.mfa_enabled ? 'Email + App' : 'Email OTP'}
                </span>
              </div>
              <p className="text-xs leading-5 text-slate-600">
                {user?.mfa_enabled
                  ? 'Both your 6-digit email verification code and your authenticator app code are accepted when signing in.'
                  : 'Every sign-in sends a 6-digit verification code to your email. Optionally link an authenticator app for offline 6-digit codes.'}
              </p>

              {!user?.mfa_enabled && !totpSetup && (
                <button
                  type="button"
                  disabled={totpBusy}
                  onClick={startTotpSetup}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {totpBusy ? 'Preparing…' : 'Set up authenticator app (optional)'}
                </button>
              )}

              {totpSetup && (
                <form onSubmit={confirmTotpSetup} className="space-y-3 rounded-xl border border-green-200 bg-white p-4">
                  <p className="text-xs font-semibold text-slate-800">Add this key to Google Authenticator, Microsoft Authenticator, or 1Password:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs font-bold tracking-wider text-slate-900">
                      {totpSetup.secret}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyText(totpSetup.secret, 'Setup key')}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Copy aria-hidden="true" className="h-3.5 w-3.5" /> Copy
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9 ]{6,8}"
                      minLength={6}
                      maxLength={8}
                      required
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="Enter 6-digit app code"
                      className="min-h-10 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-900"
                    />
                    <button type="submit" disabled={totpBusy} className="min-h-10 rounded-xl bg-green-600 px-4 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                      {totpBusy ? 'Verifying…' : 'Enable app'}
                    </button>
                    <button type="button" onClick={() => setTotpSetup(null)} className="min-h-10 px-3 text-xs font-semibold text-slate-600 hover:text-slate-800">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {Boolean(user?.mfa_enabled) && !showDisableTotp && (
                <button
                  type="button"
                  onClick={() => setShowDisableTotp(true)}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Disable authenticator app
                </button>
              )}

              {showDisableTotp && (
                <form onSubmit={disableTotp} className="space-y-3 rounded-xl border border-rose-200 bg-white p-4">
                  <p className="text-xs text-slate-600">Confirm your password to remove the authenticator app. Email 6-digit verification remains active.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="password"
                      required
                      value={disableTotpPassword}
                      onChange={(e) => setDisableTotpPassword(e.target.value)}
                      placeholder="Current password"
                      className="min-h-10 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-900"
                    />
                    <button type="submit" disabled={totpBusy} className="min-h-10 rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                      {totpBusy ? 'Removing…' : 'Confirm disable'}
                    </button>
                    <button type="button" onClick={() => { setShowDisableTotp(false); setDisableTotpPassword(''); }} className="min-h-10 px-3 text-xs font-semibold text-slate-600">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Backup Scratch Codes Card */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">Backup Scratch Codes</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${(user?.backup_codes_remaining || 0) > 0 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
                  {user?.backup_codes_remaining || 0} unused remaining
                </span>
              </div>
              <p className="text-xs leading-5 text-slate-600">
                Single-use recovery codes let you sign in even without access to your email inbox or authenticator app.
              </p>

              {!showBackupPrompt && (
                <button
                  type="button"
                  onClick={() => setShowBackupPrompt(true)}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  {(user?.backup_codes_remaining || 0) > 0 ? 'Regenerate backup codes' : 'Generate backup codes'}
                </button>
              )}

              {showBackupPrompt && (
                <form onSubmit={regenerateBackupCodes} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-600">Enter your current password to generate 8 fresh single-use scratch codes (replaces any previous unused codes).</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="password"
                      required
                      value={backupPassword}
                      onChange={(e) => setBackupPassword(e.target.value)}
                      placeholder="Current password"
                      className="min-h-10 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-900"
                    />
                    <button type="submit" disabled={backupBusy} className="min-h-10 rounded-xl bg-green-600 px-4 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                      {backupBusy ? 'Generating…' : 'Generate 8 codes'}
                    </button>
                    <button type="button" onClick={() => { setShowBackupPrompt(false); setBackupPassword(''); }} className="min-h-10 px-3 text-xs font-semibold text-slate-600">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {backupCodes && (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <p className="text-xs font-bold text-amber-950">Save these backup scratch codes now — they are only shown once:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {backupCodes.map((code) => (
                      <code key={code} className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-center font-mono text-xs font-bold tracking-wider text-slate-900">
                        {code}
                      </code>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => copyText(backupCodes.join('\n'), 'Backup scratch codes')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      <Copy aria-hidden="true" className="h-3.5 w-3.5" /> Copy all
                    </button>
                    <button
                      type="button"
                      onClick={downloadBackupCodes}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      <Download aria-hidden="true" className="h-3.5 w-3.5" /> Download .txt
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Active devices</h2>
            <p className="mt-1 text-sm text-slate-600">Sign out any device you no longer use.</p>
          </div>
          <button type="button" onClick={refreshSessions} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw aria-hidden="true" className="h-4 w-4" /> Refresh</button>
        </div>
        {loading ? <p className="mt-5 text-sm text-slate-500">Loading sessions…</p> : sessions.length ? <ul className="mt-5 divide-y divide-slate-100">
          {sessions.map((session) => <li key={session.id} className="security-device-row flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
            <div className="rounded-xl bg-slate-100 p-3 text-slate-700">{/Android|iPhone|iPad|Mobile/i.test(session.user_agent || '') ? <Smartphone aria-hidden="true" className="h-5 w-5" /> : <Laptop aria-hidden="true" className="h-5 w-5" />}</div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{deviceName(session.user_agent)} {session.is_current ? <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">This device</span> : null}</p>
              <p className="mt-1 text-sm text-slate-500">Last active {formatSessionDate(session.last_seen_at)} · Signed in {formatSessionDate(session.created_at)}</p>
            </div>
            <button type="button" disabled={busyId === session.id} onClick={() => revoke(session)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 px-3 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50"><Trash2 aria-hidden="true" className="h-4 w-4" /> {busyId === session.id ? 'Signing out…' : 'Sign out'}</button>
          </li>)}
        </ul> : <p className="mt-5 text-sm text-slate-500">No active sessions found.</p>}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950"><Lock aria-hidden="true" className="h-5 w-5 text-slate-600" /> Change password</h2>
        <form className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" onSubmit={updatePassword}>
          <label className="text-sm font-semibold text-slate-700">Current password<input type="password" autoComplete="current-password" required value={password.current} onChange={(event) => setPassword({ ...password, current: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 text-base font-normal text-slate-900 outline-none focus:border-green-700 focus:bg-white focus:ring-4 focus:ring-green-700/10" /></label>
          <label className="text-sm font-semibold text-slate-700">New password<input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password.next} onChange={(event) => setPassword({ ...password, next: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 text-base font-normal text-slate-900 outline-none focus:border-green-700 focus:bg-white focus:ring-4 focus:ring-green-700/10" /></label>
          <label className="text-sm font-semibold text-slate-700">Confirm new password<input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password.confirm} onChange={(event) => setPassword({ ...password, confirm: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 text-base font-normal text-slate-900 outline-none focus:border-green-700 focus:bg-white focus:ring-4 focus:ring-green-700/10" /></label>
          <button className="min-h-12 self-end rounded-xl bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800 sm:col-span-2 xl:col-span-3">Update password</button>
        </form>
      </section>
    </div>
  );
};

export default SecuritySettings;
