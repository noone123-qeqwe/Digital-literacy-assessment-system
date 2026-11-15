import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { useDemoMode } from '../../contexts/useDemoMode';
import { ArrowRight, CheckCircle2, Circle, Eye, EyeOff, Lock, Mail, MailCheck, Sparkles } from 'lucide-react';
import './LoginPage.css';

const skillAreas = ['Information', 'Communication', 'Content creation', 'Safety', 'Problem solving'];

export const RegisterPage = () => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    institutional_id: '',
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
  const { register } = useAuth();
  const { available: demoStatusAvailable, freeDemoReadOnly, loading: demoStatusLoading } = useDemoMode();
  const registrationPreview = demoStatusAvailable && freeDemoReadOnly;
  const navigate = useNavigate();

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
  const visibleError = (field) => (submitted || touched[field] ? validationErrors[field] : '');

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
        institutional_id: formData.institutional_id.trim(),
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

  const inputClass = 'block min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 pl-11 pr-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 hover:border-slate-300 focus:border-green-600 focus:bg-white focus:ring-4 focus:ring-green-600/10 disabled:cursor-wait disabled:opacity-70 sm:min-h-12 sm:text-sm';
  const labelClass = 'mb-2 block text-sm font-semibold text-slate-800 sm:text-base';

  const renderPasswordField = ({ id, name, label, value, visible, setVisible, autoComplete, placeholder }) => (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <div className="relative">
        <Lock aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
          minLength={name === 'password' ? 10 : undefined}
          maxLength={name === 'password' ? 128 : undefined}
          placeholder={placeholder}
          aria-invalid={Boolean(visibleError(name))}
          aria-describedby={`${id}-help${visibleError(name) ? ` ${id}-error` : ''}`}
          className={`${inputClass} pr-12 ${visibleError(name) ? 'border-red-500 focus:border-red-600 focus:ring-red-500/10' : ''}`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-green-600 sm:h-11 sm:w-11"
        >
          {visible
            ? <EyeOff aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
            : <Eye aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />}
        </button>
      </div>
      {name === 'password' ? (
        <div id={`${id}-help`} className="mt-1 flex items-center gap-2 text-xs" aria-live="polite">
          {formData.password.length >= 10
            ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-green-700" />
            : <Circle aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />}
          <span className={formData.password.length >= 10 ? 'font-medium text-green-800' : 'text-slate-600'}>At least 10 characters</span>
        </div>
      ) : formData.confirmPassword ? (
        <div id={`${id}-help`} className={`mt-1 flex items-center gap-2 text-xs ${formData.password === formData.confirmPassword ? 'font-medium text-green-800' : 'text-slate-600'}`} aria-live="polite">
          {formData.password === formData.confirmPassword
            ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-green-700" />
            : <Circle aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />}
          <span>{formData.password === formData.confirmPassword ? 'Passwords match' : 'Enter the same password in both fields'}</span>
        </div>
      ) : <span id={`${id}-help`} className="sr-only">Re-enter the password above.</span>}
      {visibleError(name) && <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-700 sm:text-sm" role="alert">{visibleError(name)}</p>}
    </div>
  );

  return (
    <main className="school-login-theme relative isolate flex min-h-svh items-center justify-center overflow-x-hidden bg-slate-950 px-3 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-5">
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
        <section className="relative isolate order-2 hidden flex-col justify-between overflow-hidden bg-green-950/50 px-6 py-6 text-white sm:flex lg:order-1 lg:px-8 lg:py-6 xl:px-9">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_15%_10%,rgba(0,107,60,0.52),transparent_45%),radial-gradient(ellipse_at_90%_90%,rgba(241,212,0,0.16),transparent_42%)]" />

          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-lg shadow-black/20 ring-1 ring-white/25 sm:h-16 sm:w-16">
              <img src="/masbate-colleges-logo-login.webp" alt="Masbate Colleges seal" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-base font-bold tracking-tight text-white sm:text-lg">DLAS Portal</p>
              <p className="mt-0.5 text-xs text-slate-100 sm:text-sm">Masbate Colleges · CCS</p>
            </div>
          </div>

          <div className="my-5 max-w-lg lg:my-0 lg:py-4">
            <p className="mb-2 inline-flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-amber-200 sm:text-xs">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Digital Literacy Assessment System
            </p>
            <h1 className="max-w-md text-2xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-4xl xl:text-5xl">
              Start your digital literacy journey.
            </h1>
            <p className="mt-3 max-w-md text-sm leading-5 text-white/95 sm:text-base sm:leading-6">
              Create your student account to complete assessments and understand your digital strengths.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {skillAreas.map((area) => (
                <span key={area} className="rounded-full border border-white/30 bg-white/15 px-3.5 py-1.5 text-xs font-semibold text-white sm:text-sm">
                  {area}
                </span>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-3 border-t border-white/15 pt-3 lg:flex">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white sm:text-sm">Aligned with DigComp 2.1</p>
              <p className="mt-0.5 text-xs text-white/85 sm:text-sm">A five-area framework for digital competence.</p>
            </div>
          </div>
        </section>

        <section className="relative isolate order-1 flex min-h-[calc(100svh-1.5rem)] flex-col justify-center overflow-hidden bg-white/75 px-4 py-5 backdrop-blur-sm sm:min-h-[calc(100svh-2.5rem)] sm:px-7 sm:py-7 lg:order-2 lg:min-h-0 lg:px-8 lg:py-6 xl:px-10">
          <div className="relative z-10 mx-auto w-full max-w-xl">
            <div className="mb-3 sm:mb-4">
              <div className="mb-4 flex items-center gap-3 sm:hidden">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
                  <img src="/masbate-colleges-logo-login.webp" alt="Masbate Colleges seal" className="h-full w-full object-contain" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900">DLAS Portal</p>
                  <p className="text-sm text-slate-600">Masbate Colleges · CCS</p>
                </div>
              </div>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-green-800 sm:text-xs">College of Computer Studies</p>
              <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Create your account</h2>
              <p className="mt-1 text-sm leading-5 text-slate-700">{registrationPreview ? 'Preview student registration. New accounts are not saved in this public demo.' : 'Register as a student to get started with your digital literacy assessment.'}</p>
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/95 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-sm sm:p-5 lg:p-4">
              {demoStatusLoading ? (
                <div className="flex min-h-64 flex-col items-center justify-center text-center" role="status" aria-live="polite">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-700/30 border-t-green-700" aria-hidden="true" />
                  <p className="mt-4 text-sm font-medium text-slate-700">Checking account options…</p>
                </div>
              ) : registrationComplete ? (
                <div className="flex min-h-[24rem] flex-col items-center justify-center text-center" role="status" aria-live="polite">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-green-800 ring-1 ring-green-100">
                    <MailCheck aria-hidden="true" className="h-8 w-8" />
                  </div>
                  <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-green-800">One last step</p>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Check your inbox</h3>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-slate-700 sm:text-base">
                    We sent a verification link to the email address below. Open it to activate your account before signing in.
                  </p>
                  <p className="mt-4 max-w-full break-all rounded-xl border border-green-100 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-950 sm:text-base">{formData.email}</p>
                  <p className="mt-3 max-w-xl text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">If it does not arrive soon, check your spam folder or request another verification email.</p>
                  <div className="mt-6 flex w-full max-w-lg flex-col gap-3 sm:flex-row">
                    <Link
                      to={`/verify-email?email=${encodeURIComponent(formData.email)}`}
                      className="flex min-h-12 flex-1 items-center justify-center rounded-xl border border-green-800 px-4 py-3 text-sm font-semibold text-green-900 transition hover:bg-green-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 sm:min-h-14 sm:text-base"
                    >
                      Resend verification email
                    </Link>
                    <Link
                      to="/login"
                      className="group flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-green-800 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-green-900/15 transition hover:bg-green-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 sm:min-h-14 sm:text-base"
                    >
                      Go to sign in
                      <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </div>
              ) : <>
              <form className="space-y-2.5 sm:space-y-3" onSubmit={handleSubmit} noValidate aria-busy={isLoading}>
                {registrationPreview && <p id="registration-preview-note" role="status" className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm leading-6 text-green-950">Registration preview only. Account creation is disabled on this demo.</p>}
                <fieldset disabled={registrationPreview || isLoading} aria-describedby={registrationPreview ? 'registration-preview-note' : undefined} className="space-y-2.5 sm:space-y-3">
                <legend className="sr-only">Create a student account</legend>
                {serverError && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-800" role="alert">{serverError}</p>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:gap-3">
                  <div>
                    <label htmlFor="registration-first-name" className={labelClass}>First name</label>
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
                      className={`block min-h-10 w-full rounded-xl border bg-slate-50 px-4 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 hover:border-slate-300 focus:bg-white focus:ring-4 disabled:cursor-wait disabled:opacity-70 sm:min-h-12 ${visibleError('first_name') ? 'border-red-500 focus:border-red-600 focus:ring-red-500/10' : 'border-slate-200 focus:border-green-600 focus:ring-green-600/10'}`}
                    />
                    {visibleError('first_name') && <p id="registration-first-name-error" className="mt-1.5 text-sm font-medium text-red-700" role="alert">{visibleError('first_name')}</p>}
                  </div>
                  <div>
                    <label htmlFor="registration-last-name" className={labelClass}>Last name</label>
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
                      className={`block min-h-10 w-full rounded-xl border bg-slate-50 px-4 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 hover:border-slate-300 focus:bg-white focus:ring-4 disabled:cursor-wait disabled:opacity-70 sm:min-h-12 ${visibleError('last_name') ? 'border-red-500 focus:border-red-600 focus:ring-red-500/10' : 'border-slate-200 focus:border-green-600 focus:ring-green-600/10'}`}
                    />
                    {visibleError('last_name') && <p id="registration-last-name-error" className="mt-1.5 text-sm font-medium text-red-700" role="alert">{visibleError('last_name')}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 lg:gap-3">
                  <div>
                    <label htmlFor="registration-email" className={labelClass}>Email address</label>
                    <div className="relative">
                      <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="registration-email"
                        type="email"
                        autoComplete="email"
                        required
                        disabled={isLoading}
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="you@example.com"
                        aria-invalid={Boolean(visibleError('email'))}
                        aria-describedby={visibleError('email') ? 'registration-email-error' : undefined}
                        className={`${inputClass} ${visibleError('email') ? 'border-red-500 focus:border-red-600 focus:ring-red-500/10' : ''}`}
                      />
                    </div>
                    {visibleError('email') && <p id="registration-email-error" className="mt-1 text-xs font-medium text-red-700" role="alert">{visibleError('email')}</p>}
                  </div>

                  <div>
                    <label htmlFor="registration-student-id" className={labelClass}>Student ID <span className="font-normal text-slate-500">(optional)</span></label>
                    <input
                      id="registration-student-id"
                      type="text"
                      autoComplete="off"
                      maxLength={64}
                      disabled={isLoading}
                      name="institutional_id"
                      value={formData.institutional_id}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="School ID (if available)"
                      className="block min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 hover:border-slate-300 focus:border-green-600 focus:bg-white focus:ring-4 focus:ring-green-600/10 disabled:cursor-wait disabled:opacity-70 sm:min-h-12"
                    />
                    <p className="mt-1 text-[0.6875rem] leading-4 text-slate-500">For official roster matching only.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:gap-3">
                  {renderPasswordField({
                    id: 'registration-password',
                    name: 'password',
                    label: 'Password',
                    value: formData.password,
                    visible: showPassword,
                    setVisible: setShowPassword,
                    autoComplete: 'new-password',
                    placeholder: 'At least 10 characters',
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

                <button
                  type="submit"
                  disabled={isLoading}
                  className="group flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-green-800 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-green-900/15 transition hover:bg-green-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:cursor-wait disabled:opacity-60 sm:min-h-12 sm:text-sm"
                >
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
                </fieldset>
              </form>

              <div className="mt-3 border-t border-slate-200 pt-2 text-center">
                <p className="text-sm text-slate-700 sm:text-base">
                  Already registered?{' '}
                  <Link to="/login" className="font-semibold text-green-800 underline-offset-4 hover:text-green-900 hover:underline">Sign in</Link>
                </p>
              </div>
              </>}
            </div>

            <p className="mt-3 pb-2 text-center text-[0.6875rem] font-semibold text-slate-800 sm:text-xs">Digital Literacy Assessment System · Masbate Colleges</p>
          </div>
        </section>
      </div>
    </main>
  );
};

export default RegisterPage;
