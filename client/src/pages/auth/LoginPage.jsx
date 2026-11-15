import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { useDemoMode } from '../../contexts/useDemoMode';
import { Lock, Mail, ArrowRight, Sparkles, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import LoginIntro from '../../components/auth/LoginIntro';

const skillAreas = [
  { name: 'Information', color: 'text-amber-200' },
  { name: 'Communication', color: 'text-sky-200' },
  { name: 'Content creation', color: 'text-violet-200' },
  { name: 'Safety', color: 'text-lime-200' },
  { name: 'Problem solving', color: 'text-pink-200' },
];

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authStep, setAuthStep] = useState('credentials');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaChallengeId, setMfaChallengeId] = useState('');
  const [mfaSetupToken, setMfaSetupToken] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [searchParams] = useSearchParams();
  const { login, completeMfaLogin, beginMfaSetup, completeMfaSetup } = useAuth();
  const { available: demoStatusAvailable, freeDemoReadOnly, loading: demoStatusLoading } = useDemoMode();
  const navigate = useNavigate();

  const continueAfterLogin = (user) => {
    if (user.role === 'admin') navigate('/admin/dashboard');
    else if (user.role === 'assessor') navigate('/assessor/dashboard');
    else navigate('/respondent/dashboard');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);

    if (result.success) {
      continueAfterLogin(result.user);
    } else if (result.mfaRequired) {
      setMfaChallengeId(result.challengeId);
      setMfaCode('');
      setAuthStep('mfa');
    } else if (result.mfaSetupRequired) {
      setMfaSetupToken(result.setupToken);
      setMfaBusy(true);
      const setup = await beginMfaSetup(result.setupToken);
      setMfaBusy(false);
      if (setup.success) {
        setMfaSecret(setup.secret);
        setAuthStep('mfa-setup');
      }
    } else if (result.verificationRequired) {
      setVerificationRequired(true);
    }
  };

  const handleMfaSubmit = async (event) => {
    event.preventDefault();
    setMfaBusy(true);
    const result = authStep === 'mfa-setup'
      ? await completeMfaSetup(mfaSetupToken, mfaCode)
      : await completeMfaLogin(mfaChallengeId, mfaCode);
    setMfaBusy(false);
    if (result.success) continueAfterLogin(result.user);
  };

  return (
    <LoginIntro skipIntro={searchParams.get('registered') === '1'}>
    <main className="relative isolate flex min-h-svh items-center justify-center overflow-x-hidden bg-slate-950 px-3 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-5">
      <img
        aria-hidden="true"
        alt=""
        src="/masbate-colleges-campus-login.webp"
        decoding="async"
        fetchPriority="high"
        className="pointer-events-none fixed inset-0 z-0 h-screen w-screen object-cover object-[center_40%]"
      />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-green-950/25" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-36 h-96 w-96 rounded-full bg-green-200/50 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-28 h-96 w-96 rounded-full bg-amber-200/50 blur-3xl" />

      <div className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[1.25rem] border border-white/35 bg-white/10 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.42)] lg:min-h-[calc(100svh-2.5rem)] lg:grid-cols-[0.9fr_1.1fr] lg:rounded-[1.75rem]">
        <section className="relative isolate order-2 flex flex-col justify-between overflow-hidden bg-green-950/45 px-5 py-5 text-white sm:px-7 sm:py-6 lg:order-1 lg:px-8 lg:py-6 xl:px-9">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_15%_10%,rgba(0,107,60,0.52),transparent_45%),radial-gradient(ellipse_at_90%_90%,rgba(241,212,0,0.16),transparent_42%)]" />
          <div aria-hidden="true" className="absolute -right-24 top-28 -z-10 h-72 w-72 rounded-full border border-white/[0.08]" />

          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-lg shadow-black/20 ring-1 ring-white/25 sm:h-16 sm:w-16">
              <img src="/masbate-colleges-logo-login.webp" alt="Masbate Colleges seal" decoding="async" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-base font-bold tracking-tight text-white sm:text-lg">DLAS Portal</p>
              <p className="mt-0.5 text-xs text-slate-200 sm:text-sm">Masbate Colleges · CCS</p>
            </div>
          </div>

          <div className="my-4 max-w-lg sm:my-6 lg:my-0 lg:py-4">
            <p className="mb-2 inline-flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-amber-200 sm:text-xs lg:text-sm">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Digital Literacy Assessment System
            </p>
            <h1 className="max-w-md text-2xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-4xl xl:text-5xl">
              Know your skills. Grow your confidence.
            </h1>
            <p className="mt-3 max-w-md text-sm leading-5 text-white/95 sm:text-base sm:leading-6 lg:text-base">
              Sign in to take your assessment or review your results.
            </p>

            <div className="mt-5 hidden flex-wrap gap-2 sm:flex">
              {skillAreas.map((area) => (
                <span key={area.name} className={`rounded-full border border-white/30 bg-white/15 px-3.5 py-1.5 text-sm font-semibold ${area.color} sm:text-base`}>
                  {area.name}
                </span>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-3 border-t border-white/10 pt-3 sm:flex">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white sm:text-sm">Aligned with DigComp 2.1</p>
              <p className="mt-0.5 text-xs text-white/85 sm:text-sm">A five-area framework for digital competence.</p>
            </div>
          </div>
        </section>

        <section className="relative isolate order-1 flex min-h-[calc(100svh-1.5rem)] flex-col justify-center overflow-hidden bg-white/65 px-4 py-5 backdrop-blur-sm sm:min-h-[calc(100svh-2.5rem)] sm:px-7 sm:py-7 lg:order-2 lg:min-h-0 lg:px-8 lg:py-6 xl:px-10">
          <div className="relative z-10 mx-auto w-full max-w-xl">
            <div className="mb-4 sm:mb-5">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-green-700 sm:text-xs">{authStep === 'credentials' ? 'College of Computer Studies' : 'Account security'}</p>
              <h2 data-login-heading tabIndex={-1} className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-4xl xl:text-5xl">{authStep === 'credentials' ? 'Welcome back' : authStep === 'mfa-setup' ? 'Secure your account' : 'Verify it’s you'}</h2>
              <p className="mt-1 text-sm leading-5 text-slate-600 sm:text-base sm:leading-6">{authStep === 'credentials' ? 'Sign in with the email linked to your account.' : authStep === 'mfa-setup' ? 'Administrators and teachers must set up an authenticator app before using the system.' : 'Enter the current six-digit code from your authenticator app.'}</p>
            </div>

            <div className="flex flex-col justify-center rounded-2xl border border-white/70 bg-white/95 p-5 shadow-lg shadow-slate-900/10 backdrop-blur-sm sm:p-6 lg:border-slate-200 lg:p-7 lg:shadow-xl">
              {authStep === 'credentials' ? <form className="space-y-5 sm:space-y-6" onSubmit={handleSubmit} aria-busy={isLoading}>
                <div>
                  <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-slate-800 sm:text-base">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      disabled={isLoading}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="block min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 hover:border-slate-300 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-500/10 disabled:cursor-wait disabled:opacity-70 sm:min-h-14 sm:text-base"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-slate-800 sm:text-base">
                    Password
                  </label>
                  <div className="relative">
                    <Lock aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      disabled={isLoading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="block min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 hover:border-slate-300 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-500/10 disabled:cursor-wait disabled:opacity-70 sm:min-h-14 sm:text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-green-600 sm:h-11 sm:w-11"
                    >
                      {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.75} /> : <Eye aria-hidden="true" className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.75} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="group flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-green-900/15 transition hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:cursor-wait disabled:opacity-60 sm:min-h-14 sm:text-base"
                >
                  {isLoading ? (
                    <>
                      <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form> : <form className="space-y-5" onSubmit={handleMfaSubmit} aria-busy={mfaBusy}>
                {authStep === 'mfa-setup' && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
                      <div>
                        <p className="font-semibold text-green-950">Add this key to an authenticator app</p>
                        <p className="mt-1 text-sm text-green-900">Use an app such as Microsoft Authenticator, Google Authenticator, or 1Password, then enter the six-digit code it generates.</p>
                        <code className="mt-3 block break-all rounded-lg bg-white px-3 py-2 font-mono text-sm font-bold tracking-wider text-slate-900">{mfaSecret}</code>
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label htmlFor="mfa-code" className="mb-2 block text-base font-semibold text-slate-800 sm:text-lg">Authenticator code</label>
                  <input id="mfa-code" name="mfa-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" minLength={6} maxLength={8} required value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} placeholder="000000" className="block min-h-14 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-center font-mono text-2xl font-bold tracking-[0.35em] text-slate-900 outline-none focus:border-green-600 focus:bg-white focus:ring-4 focus:ring-green-600/10" />
                </div>
                <button type="submit" disabled={mfaBusy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-3 text-base font-semibold text-white shadow-md transition hover:bg-green-800 disabled:cursor-wait disabled:opacity-60">
                  {mfaBusy ? 'Verifying…' : authStep === 'mfa-setup' ? 'Enable MFA and sign in' : 'Verify and sign in'}
                </button>
                <button type="button" onClick={() => { setAuthStep('credentials'); setMfaCode(''); }} className="w-full text-center text-sm font-semibold text-green-800 hover:underline">Back to sign in</button>
              </form>}

              {authStep === 'credentials' && <div className="mt-4 border-t border-slate-200 pt-3 text-center">
                {demoStatusLoading ? (
                  <p className="text-sm text-slate-600 sm:text-base" role="status">Checking account options…</p>
                ) : demoStatusAvailable && freeDemoReadOnly ? (
                  <p className="text-sm font-medium text-slate-600 sm:text-base" role="status">Registration is disabled in this read-only demo.</p>
                ) : (
                  <p className="text-sm text-slate-700 sm:text-base">
                    New student?{' '}
                    <Link to="/register" className="font-semibold text-green-700 underline-offset-4 hover:text-green-800 hover:underline">
                      Register here
                    </Link>
                  </p>
                )}
                <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm sm:text-base">
                  <Link to="/forgot-password" className="font-semibold text-green-800 underline-offset-4 hover:text-green-900 hover:underline">Forgot password?</Link>
                  {verificationRequired && <Link to="/verify-email" className="font-semibold text-green-800 underline-offset-4 hover:text-green-900 hover:underline">Resend verification</Link>}
                </div>
              </div>}
            </div>

            {searchParams.get('registered') === '1' && <p role="status" className="mt-3 text-center text-sm font-medium text-green-900">Your account is ready. Verify the email we sent before signing in.</p>}
            <p className="mt-3 text-center text-[0.6875rem] text-slate-700 sm:text-xs">Digital Literacy Assessment System · Masbate Colleges</p>
          </div>
        </section>
      </div>
    </main>
    </LoginIntro>
  );
};

export default LoginPage;














