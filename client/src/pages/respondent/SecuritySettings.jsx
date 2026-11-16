import React, { useCallback, useEffect, useState } from 'react';
import { Laptop, ShieldCheck, Smartphone, Trash2, Lock, RefreshCw } from 'lucide-react';
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
  const { user, changePassword } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });

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

  return (
    <div className="security-settings mx-auto w-full max-w-6xl space-y-7 pb-10">
      <PageHeader title="Security & sessions" description="Manage your password and the devices signed in to this account." />

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-green-50 p-3 text-green-800"><ShieldCheck aria-hidden="true" className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-950">Sign-in protections</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Account: <span className="security-account-email font-medium text-slate-800">{user?.email}</span></p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user?.email_verified ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>{user?.email_verified ? 'Email verified' : 'Email verification required'}</span>
              {user?.role !== 'respondent' && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user?.mfa_enabled ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800'}`}>{user?.mfa_enabled ? 'Authenticator MFA enabled' : 'Authenticator MFA required'}</span>}
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Session expires automatically</span>
            </div>
          </div>
        </div>
      </section>

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
