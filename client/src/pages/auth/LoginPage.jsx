import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { useDemoMode } from '../../contexts/useDemoMode';
import {
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  UserRoundPlus,
  CircleAlert,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import AuthShell from '../../components/auth/AuthShell';
import './LoginPage.css';

const silentToast = { silentErrorToast: true };

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authStep, setAuthStep] = useState('credentials');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaChallengeId, setMfaChallengeId] = useState('');
  const [mfaMaskedEmail, setMfaMaskedEmail] = useState('');
  const [mfaMethods, setMfaMethods] = useState({ emailOtp: true, totp: false, backupCode: false });
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [mfaSetupToken, setMfaSetupToken] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [formError, setFormError] = useState('');
  const headingRef = useRef(null);
  const submittingRef = useRef(false);
  const [searchParams] = useSearchParams();
  const { login, completeMfaLogin, resendMfaOtp, beginMfaSetup, completeMfaSetup } = useAuth();
  const { available: demoStatusAvailable, freeDemoReadOnly, loading: demoStatusLoading } = useDemoMode();
  const navigate = useNavigate();

  useEffect(() => {
    if (authStep !== 'credentials') headingRef.current?.focus();
  }, [authStep]);

  const continueAfterLogin = (user) => {
    if (user.role === 'admin') navigate('/admin/dashboard');
    else navigate('/respondent/dashboard');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password || submittingRef.current) return;
    submittingRef.current = true;
    setFormError('');
    setVerificationRequired(false);
    setIsLoading(true);
    try {
      const result = await login(email, password, silentToast);
      if (result?.success) {
        continueAfterLogin(result.user);
      } else if (result?.mfaRequired) {
        setMfaChallengeId(result.challengeId);
        setMfaMaskedEmail(result.maskedEmail || '');
        setMfaMethods(result.methods || { emailOtp: true, totp: false, backupCode: false });
        setUseBackupCode(false);
        setMfaCode('');
        setAuthStep('mfa');
      } else if (result?.mfaSetupRequired) {
        setMfaSetupToken(result.setupToken);
        const setup = await beginMfaSetup(result.setupToken, silentToast);
        if (setup.success) {
          setMfaSecret(setup.secret);
          setCopiedSecret(false);
          setMfaCode('');
          setAuthStep('mfa-setup');
        } else {
          setFormError(setup.message || 'We could not prepare account verification. Please try again.');
        }
      } else {
        setVerificationRequired(Boolean(result?.verificationRequired));
        setFormError(result?.message || 'We could not sign you in. Please try again.');
      }
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFormError('');
    setMfaBusy(true);
    try {
      const result = authStep === 'mfa-setup'
        ? await completeMfaSetup(mfaSetupToken, mfaCode, silentToast)
        : await completeMfaLogin(mfaChallengeId, mfaCode, silentToast);
      if (result.success) continueAfterLogin(result.user);
      else setFormError(result.message || 'We could not verify this code. Please try again.');
    } finally {
      submittingRef.current = false;
      setMfaBusy(false);
    }
  };

  const copySecretKey = async () => {
    try {
      await navigator.clipboard.writeText(mfaSecret);
      setCopiedSecret(true);
      window.setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      setFormError('Copy failed. Select and copy the key manually.');
    }
  };

  return (
    <AuthShell
      headline="Know your skills. Grow your confidence."
      description="Sign in to take your assessment or review your results."
    >
        <header className="login-card-heading">
          <p className="login-card-eyebrow">
            {authStep === 'credentials' ? 'College of Computer Studies' : (
              <>
                <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                <span>Two-step verification</span>
              </>
            )}
          </p>
          <h2 ref={headingRef} data-login-heading tabIndex={-1}>
            {authStep === 'credentials'
              ? 'Welcome back'
              : authStep === 'mfa-setup'
                ? 'Secure your account'
                : 'Verify your sign-in'}
          </h2>
          <p>
            {authStep === 'credentials'
              ? 'Sign in with the email linked to your account.'
              : authStep === 'mfa-setup'
                ? 'Set up an authenticator app for your account.'
                : useBackupCode
                  ? 'Enter one of your single-use backup scratch codes.'
                  : `We emailed a 6-digit verification code to ${mfaMaskedEmail || 'your inbox'}.${mfaMethods.totp ? ' You can also use your authenticator app code.' : ''}`}
          </p>
        </header>

        {formError && (
          <div id="login-feedback" className="login-feedback" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <p>{formError}</p>
          </div>
        )}
        {!formError && searchParams.get('reason') === 'expired' && authStep === 'credentials' && (
          <div className="login-feedback" role="status">
            <CircleAlert size={18} aria-hidden="true" />
            <p>Your session expired. Sign in again to continue.</p>
          </div>
        )}
        {!formError && searchParams.get('registered') === '1' && authStep === 'credentials' && (
          <div className="login-feedback login-feedback-success" role="status">
            <CheckCircle2 size={18} aria-hidden="true" />
            <p>Your account is ready. Verify the email we sent before signing in.</p>
          </div>
        )}

        {authStep === 'credentials' ? (
          <form
            className="login-form"
            onSubmit={handleSubmit}
            aria-busy={isLoading}
            aria-describedby={formError ? 'login-feedback' : undefined}
          >
            <div className="login-field">
              <label htmlFor="login-email">Email address</label>
              <div className="login-input-shell">
                <Mail aria-hidden="true" size={18} />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  disabled={isLoading}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setFormError(''); }}
                  placeholder="you@example.com"
                  className="login-input"
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <div className="login-input-shell">
                <Lock aria-hidden="true" size={18} />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFormError(''); }}
                  placeholder="Enter your password"
                  className="login-input login-input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  disabled={isLoading}
                  className="login-password-toggle"
                >
                  {showPassword
                    ? <EyeOff aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} />
                    : <Eye aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} />}
                </button>
              </div>
              <div className="login-password-recovery">
                <Link to="/forgot-password" className="login-inline-link">Forgot password?</Link>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="login-submit group">
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
          </form>
        ) : (
          <form
            className="login-form"
            onSubmit={handleMfaSubmit}
            aria-busy={mfaBusy}
            aria-describedby={formError ? 'login-feedback' : undefined}
          >
            {authStep === 'mfa-setup' && (
              <div className="rounded-xl border border-green-200 bg-green-50/80 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-green-950">Add this key to an authenticator app</p>
                    <p className="mt-1 text-xs leading-5 text-green-900/90">
                      Use Microsoft Authenticator, Google Authenticator, or 1Password, then enter the 6-digit code it generates.
                    </p>
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-200/80 bg-white px-3 py-2">
                      <code className="min-w-0 flex-1 break-all font-mono text-xs font-bold tracking-wider text-slate-900 sm:text-sm">
                        {mfaSecret}
                      </code>
                      <button
                        type="button"
                        onClick={copySecretKey}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-green-800 hover:bg-green-50"
                      >
                        {copiedSecret ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                        <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="login-field">
              <label htmlFor="mfa-code">
                {authStep === 'mfa-setup'
                  ? 'Authenticator code'
                  : useBackupCode
                    ? 'Backup scratch code'
                    : mfaMethods.totp
                      ? '6-digit email or authenticator code'
                      : '6-digit email verification code'}
              </label>
              <input
                id="mfa-code"
                name="mfa-code"
                type="text"
                inputMode={useBackupCode ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                autoCapitalize={useBackupCode ? 'characters' : 'none'}
                pattern={useBackupCode ? '[A-Za-z0-9- ]{6,16}' : '[0-9 ]{6,8}'}
                minLength={6}
                maxLength={useBackupCode ? 16 : 8}
                required
                disabled={mfaBusy}
                value={mfaCode}
                onChange={(event) => { setMfaCode(event.target.value); setFormError(''); }}
                placeholder={useBackupCode ? 'XXXX-XXXX' : '000000'}
                className="login-input login-code-input"
              />
            </div>

            <button type="submit" disabled={mfaBusy} className="login-submit">
              {mfaBusy ? 'Verifying…' : authStep === 'mfa-setup' ? 'Enable MFA and sign in' : 'Verify and sign in'}
            </button>

            {authStep === 'mfa' && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-green-800">
                {!useBackupCode && (
                  <button
                    type="button"
                    disabled={mfaBusy || resendingOtp}
                    onClick={async () => {
                      setResendingOtp(true);
                      setFormError('');
                      const res = await resendMfaOtp(mfaChallengeId, silentToast);
                      if (!res.success) setFormError(res.message);
                      setResendingOtp(false);
                    }}
                    className="underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    {resendingOtp ? 'Sending code…' : 'Resend email code'}
                  </button>
                )}
                {(mfaMethods.backupCode || useBackupCode) && (
                  <button
                    type="button"
                    disabled={mfaBusy}
                    onClick={() => {
                      setUseBackupCode((prev) => !prev);
                      setMfaCode('');
                      setFormError('');
                    }}
                    className="ml-auto underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    {useBackupCode ? 'Use 6-digit email code' : 'Use backup scratch code'}
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={mfaBusy}
              onClick={() => {
                setAuthStep('credentials');
                setMfaCode('');
                setUseBackupCode(false);
                setFormError('');
                headingRef.current?.focus();
              }}
              className="login-back"
            >
              Back to sign in
            </button>
          </form>
        )}

        {authStep === 'credentials' && (
          <>
            <div className="text-center">
              <Link
                to="/register"
                className="login-create-account"
                aria-describedby={demoStatusAvailable && freeDemoReadOnly ? 'login-registration-note' : undefined}
              >
                <UserRoundPlus aria-hidden="true" size={18} />
                <span>Create student account</span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
              {demoStatusLoading && <p className="mt-2 text-xs text-slate-600" role="status">Checking account options…</p>}
              {demoStatusAvailable && freeDemoReadOnly && (
                <p id="login-registration-note" className="mt-2 text-xs leading-5 text-slate-600">
                  Preview student registration. This demo does not save new accounts.
                </p>
              )}
              {verificationRequired && (
                <div className="mt-3 text-sm">
                  <Link to="/verify-email" className="font-semibold text-green-800 underline-offset-4 hover:text-green-900 hover:underline">
                    Resend verification email
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </AuthShell>
  );
};

export default LoginPage;
