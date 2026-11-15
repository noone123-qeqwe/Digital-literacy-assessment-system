import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import api from '../../api/axios';

export const GuardianConsentPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [details, setDetails] = useState(null);
  const [status, setStatus] = useState(token
    ? 'Loading the guardian consent information…'
    : 'This guardian link is missing its confirmation token. Ask the student to request a new link.');
  const [confirmed, setConfirmed] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(Boolean(token));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      return () => { active = false; };
    }
    api.post('/consents/guardian/preview', { token })
      .then((response) => {
        if (!active) return;
        setDetails(response.data?.data || null);
        setStatus('Review the study information below. Nothing is confirmed until you choose to consent.');
      })
      .catch((error) => {
        if (active) setStatus(error.response?.data?.message || 'This guardian link is invalid or expired. Ask the student to request a new link.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const handleConfirm = async (event) => {
    event.preventDefault();
    if (!token || !confirmed) return;
    setSubmitting(true);
    try {
      const response = await api.post('/consents/guardian/verify', { token, confirmed: true });
      setStatus(response.data.message);
      setSuccess(true);
    } catch (error) {
      setStatus(error.response?.data?.message || 'This guardian link is invalid or expired. Ask the student to request a new link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-xl sm:p-10">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${success ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
          <ShieldCheck aria-hidden="true" className="h-7 w-7" />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-green-700">Masbate Colleges · DLAS</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Parent/guardian consent</h1>
        <p role="status" className="mt-4 leading-7 text-slate-700">{status}</p>

        {details && !success && (
          <form onSubmit={handleConfirm} className="mt-6 space-y-5 text-left">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">
              <p><span className="font-semibold">Student:</span> {details.studentFirstName}</p>
              <p><span className="font-semibold">Assessment:</span> {details.assessmentTitle}</p>
              <p><span className="font-semibold">Consent version:</span> {details.consentVersion}</p>
            </div>
            <section aria-labelledby="guardian-consent-wording" className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h2 id="guardian-consent-wording" className="font-bold text-amber-950">Guardian consent information</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{details.guardianConsentText}</p>
            </section>
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-sm leading-6 text-slate-700">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-1 h-4 w-4 accent-green-700"
                required
              />
              <span>I have reviewed the information above and consent to the student’s participation as described.</span>
            </label>
            <button type="submit" disabled={!confirmed || submitting || loading} className="min-h-12 w-full rounded-xl bg-green-800 px-5 py-3 text-sm font-bold text-white hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? 'Recording consent…' : 'Confirm guardian consent'}
            </button>
          </form>
        )}

        {!details && loading && <div role="status" className="mt-6 text-sm text-slate-500">Checking this one-time link…</div>}
        <p className="mt-5 text-sm leading-6 text-slate-500">This confirmation applies only to the named assessment. The student’s account does not open through this page.</p>
        <Link to="/login" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-5 font-semibold text-slate-700 hover:bg-slate-50">Close page</Link>
      </section>
    </main>
  );
};

export default GuardianConsentPage;
