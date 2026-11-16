import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { useDemoMode } from '../../contexts/useDemoMode';
import { dashboardPathForRole } from '../../utils/helpers';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleAlert,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MailCheck,
} from 'lucide-react';
import AuthShell from '../../components/auth/AuthShell';
import './LoginPage.css';

export const RegisterPage = () => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const { register, refreshUser } = useAuth() || {};
  const { available: demoStatusAvailable, freeDemoReadOnly, loading: demoStatusLoading } = useDemoMode();
  const registrationPreview = demoStatusAvailable && freeDemoReadOnly;
  const navigate = useNavigate();

  useEffect(() => {
    if (!registrationComplete || typeof refreshUser !== 'function') return undefined;
    let active = true;
    const syncVerifiedSession = async () => {
      const currentUser = await refreshUser({ suppressSessionRedirect: true, suppressErrorToast: true });
      if (active && currentUser?.email_verified) {
        navigate(dashboardPathForRole(currentUser.role), { replace: true });
      }
    };

    let channel = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('dlas:auth');
        channel.onmessage = (event) => {
          if (event.data?.type === 'EMAIL_VERIFIED') void syncVerifiedSession();
        };
      }
    } catch {}

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void syncVerifiedSession();
    };
    window.addEventListener('focus', syncVerifiedSession);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      channel?.close();
      window.removeEventListener('focus', syncVerifiedSession);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [navigate, refreshUser, registrationComplete]);

  const validate = (values) => {
    const errors = {};
    if (!values.first_name.trim()) errors.first_name = 'Enter your first name.';
    if (!values.last_name.trim()) errors.last_name = 'Enter your last name.';
    if (!values.email.trim()) errors.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Enter a valid email address.';
    if (values.password.length < 10) errors.password = 'Use at least 10 characters.';
    if (values.password.length > 128) errors.password = 'Use no more than 128 characters.';
    if (!values.confirmPassword) errors.confirmPassword = 'Confirm your password.';
    else if (values.password !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    return errors;
  };

  const validationErrors = validate(formData);
  const visibleError = (field) => {
    if (field === 'confirmPassword' && !submitted && !formData.confirmPassword) return '';
    return submitted || touched[field] ? validationErrors[field] : '';
  };

  const handleChange = (e) => {
    setFormData((current) => ({ ...current, [e.target.name]: e.target.value }));
    setServerError('');
  };

  const handleBlur = (e) => {
    setTouched((current) => ({ ...current, [e.target.name]: true }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (registrationPreview || demoStatusLoading) return;
    setSubmitted(true);
    setTouched({ first_name: true, last_name: true, email: true, password: true, confirmPassword: true });
    const errors = validate(formData);
    if (Object.keys(errors).length > 0) {
      const firstInvalidField = Object.keys(errors)[0];
      requestAnimationFrame(() => document.querySelector(`[name="${firstInvalidField}"]`)?.focus());
      return;
    }

    setIsLoading(true);
    try {
      const result = await register({
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: 'respondent',
      });

      if (result?.success && result.verificationRequired) {
        setRegistrationComplete(true);
      } else if (result?.success) {
        navigate('/login?registered=1');
      } else {
        setServerError(result?.message || 'We could not create your account. Please review the form and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderPasswordField = ({ id, name, label, value, visible, setVisible, autoComplete, placeholder }) => {
    const error = visibleError(name);
    const isPassword = name === 'password';
    const lengthMet = formData.password.length >= 10;
    const passwordsMatch = Boolean(formData.confirmPassword) && formData.password === formData.confirmPassword;

    return (
      <div className="login-field">
        <label htmlFor={id}>{label}</label>
        <div className="login-input-shell">
          <Lock aria-hidden="true" size={17} />
          <input
            id={id}
            name={name}
            type={visible ? 'text' : 'password'}
            autoComplete={autoComplete}
            required
            disabled={isLoading}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            minLength={isPassword ? 10 : undefined}
            maxLength={isPassword ? 128 : undefined}
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            aria-describedby={`${id}-feedback`}
            className="login-input login-input-password"
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            aria-pressed={visible}
            className="login-password-toggle"
          >
            {visible
              ? <EyeOff aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} />
              : <Eye aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} />}
          </button>
        </div>

        <div id={`${id}-feedback`} className="mt-1.5 min-h-[1.125rem] text-xs" aria-live="polite">
          {error ? (
            <p className="flex items-center gap-1.5 font-medium text-red-700" role="alert">
              <CircleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          ) : isPassword ? (
            <p className={`flex items-center gap-1.5 ${lengthMet ? 'font-medium text-green-800' : 'text-slate-600'}`}>
              {lengthMet
                ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-green-700" />
                : <Circle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
              <span>At least 10 characters{formData.password.length > 0 && !lengthMet ? ` (${formData.password.length}/10)` : ''}</span>
            </p>
          ) : formData.confirmPassword ? (
            <p className={`flex items-center gap-1.5 ${passwordsMatch ? 'font-medium text-green-800' : 'text-slate-600'}`}>
              {passwordsMatch
                ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-green-700" />
                : <Circle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
              <span>{passwordsMatch ? 'Passwords match' : 'Keep typing to match'}</span>
            </p>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <AuthShell
      wide
      headline="Start your digital literacy journey."
      description="Create your student account to complete assessments and understand your digital strengths."
    >
      {demoStatusLoading ? (
        <div className="flex min-h-64 flex-col items-center justify-center text-center" role="status" aria-live="polite">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-700/30 border-t-green-700" aria-hidden="true" />
          <p className="mt-4 text-sm font-medium text-slate-700">Checking account options…</p>
        </div>
      ) : registrationComplete ? (
        <div className="flex min-h-[22rem] flex-col items-center justify-center py-2 text-center" role="status" aria-live="polite">
          <div className="flex h-15 w-15 items-center justify-center rounded-2xl bg-green-50 text-green-800 ring-1 ring-green-200/70">
            <MailCheck aria-hidden="true" className="h-7 w-7" />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-green-800">One last step</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Check your inbox</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
            We sent a verification link to the email address below. Open it to activate your account and go straight to your dashboard.
          </p>
          <p className="mt-4 max-w-full break-all rounded-xl border border-green-200/80 bg-green-50/70 px-4 py-2.5 text-sm font-semibold text-green-950">
            {formData.email}
          </p>
          <p className="mt-3 max-w-md text-xs leading-5 text-slate-500">
            If it does not arrive soon, check your spam folder or request another verification email.
          </p>
          <div className="mt-6 flex w-full flex-col gap-2.5 sm:flex-row">
            <Link
              to={`/verify-email?email=${encodeURIComponent(formData.email)}`}
              className="login-create-account flex-1"
            >
              Resend verification
            </Link>
            <Link
              to="/login"
              className="login-submit group flex-1"
            >
              <span>Go to sign in</span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      ) : (
        <>
          <header className="login-card-heading login-card-heading--compact">
            <p className="login-card-eyebrow">College of Computer Studies</p>
            <h2>Create your account</h2>
            <p>
              {registrationPreview
                ? 'Preview student registration. New accounts are not saved in this public demo.'
                : 'Register as a student to start your digital literacy assessment.'}
            </p>
          </header>

          {registrationPreview && (
            <p id="registration-preview-note" role="status" className="login-feedback login-feedback-success">
              Registration preview only. Account creation is disabled on this demo.
            </p>
          )}
          {serverError && (
            <div className="login-feedback" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              <p>{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate aria-busy={isLoading}>
            <fieldset
              disabled={registrationPreview || isLoading}
              aria-describedby={registrationPreview ? 'registration-preview-note' : undefined}
              className="m-0 min-w-0 border-0 p-0"
            >
              <legend className="sr-only">Create a student account</legend>
              <div className="login-form login-form--register">

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="login-field">
                  <label htmlFor="registration-first-name">First name</label>
                  <input
                    id="registration-first-name"
                    type="text"
                    autoComplete="given-name"
                    required
                    disabled={isLoading}
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Juan"
                    aria-invalid={Boolean(visibleError('first_name'))}
                    aria-describedby={visibleError('first_name') ? 'registration-first-name-error' : undefined}
                    className="login-input login-input--plain"
                  />
                  {visibleError('first_name') && (
                    <p id="registration-first-name-error" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-700" role="alert">
                      <CircleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span>{visibleError('first_name')}</span>
                    </p>
                  )}
                </div>

                <div className="login-field">
                  <label htmlFor="registration-last-name">Last name</label>
                  <input
                    id="registration-last-name"
                    type="text"
                    autoComplete="family-name"
                    required
                    disabled={isLoading}
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Dela Cruz"
                    aria-invalid={Boolean(visibleError('last_name'))}
                    aria-describedby={visibleError('last_name') ? 'registration-last-name-error' : undefined}
                    className="login-input login-input--plain"
                  />
                  {visibleError('last_name') && (
                    <p id="registration-last-name-error" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-700" role="alert">
                      <CircleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span>{visibleError('last_name')}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="registration-email">Email address</label>
                <div className="login-input-shell">
                  <Mail aria-hidden="true" size={17} />
                  <input
                    id="registration-email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={isLoading}
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="you@example.com"
                    aria-invalid={Boolean(visibleError('email'))}
                    aria-describedby={visibleError('email') ? 'registration-email-error' : undefined}
                    className="login-input"
                  />
                </div>
                {visibleError('email') && (
                  <p id="registration-email-error" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-700" role="alert">
                    <CircleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    <span>{visibleError('email')}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {renderPasswordField({
                  id: 'registration-password',
                  name: 'password',
                  label: 'Password',
                  value: formData.password,
                  visible: showPassword,
                  setVisible: setShowPassword,
                  autoComplete: 'new-password',
                  placeholder: 'Create a password',
                })}
                {renderPasswordField({
                  id: 'registration-confirm-password',
                  name: 'confirmPassword',
                  label: 'Confirm password',
                  value: formData.confirmPassword,
                  visible: showConfirmPassword,
                  setVisible: setShowConfirmPassword,
                  autoComplete: 'new-password',
                  placeholder: 'Re-enter your password',
                })}
              </div>

              <button type="submit" disabled={isLoading} className="login-submit group mt-1">
                {isLoading ? (
                  <>
                    <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    <span>Creating account…</span>
                  </>
                ) : (
                  <>
                    <span>{registrationPreview ? 'Create account — preview only' : 'Create account'}</span>
                    <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
              </div>
            </fieldset>
          </form>

          <div className="login-registration">
            <p className="text-sm text-slate-600">
              Already registered?{' '}
              <Link to="/login" className="font-semibold text-green-800 underline-offset-4 hover:text-green-900 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </>
      )}
    </AuthShell>
  );
};

export default RegisterPage;
