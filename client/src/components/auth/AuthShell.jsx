import React from 'react';
import { Sparkles } from 'lucide-react';

const skillAreas = [
  { name: 'Information', dot: 'bg-amber-300' },
  { name: 'Communication', dot: 'bg-sky-300' },
  { name: 'Content creation', dot: 'bg-violet-300' },
  { name: 'Safety', dot: 'bg-emerald-300' },
  { name: 'Problem solving', dot: 'bg-rose-300' },
];

/** Shared atmospheric shell and Masbate Colleges brand showcase for sign-in and registration. */
export default function AuthShell({ headline, description, wide = false, children }) {
  return (
    <main className="dlas-login-page dlas-auth-page school-login-theme relative isolate flex min-h-svh items-center justify-center overflow-x-hidden bg-slate-950 px-3 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-5">
      <img
        aria-hidden="true"
        alt=""
        src="/masbate-colleges-campus-login.webp"
        decoding="async"
        fetchPriority="high"
        className="pointer-events-none fixed inset-0 z-0 h-screen w-screen object-cover object-[center_40%]"
      />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-br from-green-950/45 via-slate-950/35 to-green-950/55" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-36 h-96 w-96 rounded-full bg-green-200/40 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-28 h-96 w-96 rounded-full bg-amber-200/40 blur-3xl" />

      <div className="login-shell relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[1.25rem] border border-white/40 bg-white/10 shadow-[0_28px_84px_-28px_rgba(6,24,15,0.55)] lg:min-h-[calc(100svh-2.5rem)] lg:grid-cols-[0.88fr_1.12fr] lg:rounded-[1.75rem]">
        <section className="login-brand-panel relative isolate order-2 flex flex-col justify-between overflow-hidden bg-green-950/65 px-5 py-5 text-white backdrop-blur-[2px] sm:px-7 sm:py-6 lg:order-1 lg:px-8 lg:py-7 xl:px-9">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_15%_10%,rgba(0,107,60,0.58),transparent_48%),radial-gradient(ellipse_at_90%_90%,rgba(241,212,0,0.18),transparent_44%)]" />
          <div aria-hidden="true" className="absolute -right-24 top-28 -z-10 h-72 w-72 rounded-full border border-white/[0.08]" />

          <div className="login-brand-row flex items-center gap-3.5">
            <div className="flex h-13 w-13 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-lg shadow-black/25 ring-1 ring-white/30 sm:h-15 sm:w-15">
              <img src="/masbate-colleges-logo-login.webp" alt="Masbate Colleges seal" decoding="async" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-base font-bold tracking-tight text-white sm:text-lg">DLAS Portal</p>
              <p className="mt-0.5 text-xs font-medium text-green-100/90 sm:text-sm">Masbate Colleges · CCS</p>
            </div>
          </div>

          <div className="login-brand-copy my-4 max-w-lg sm:my-6 lg:my-0 lg:py-4">
            <p className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.11em] text-amber-200 sm:text-xs">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Digital Literacy Assessment System
            </p>
            <h1 className="max-w-md text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl xl:text-[2.65rem]">
              {headline}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/90 sm:text-base">
              {description}
            </p>

            <div className="mt-6 hidden flex-wrap gap-2 sm:flex">
              {skillAreas.map((area) => (
                <span
                  key={area.name}
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/12 px-3.5 py-1.5 text-xs font-semibold text-white/95 backdrop-blur-xs sm:text-sm"
                >
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${area.dot}`} />
                  {area.name}
                </span>
              ))}
            </div>
          </div>

          <div className="login-framework-note hidden items-center gap-3 border-t border-white/15 pt-3.5 sm:flex">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-400/15 text-amber-200">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white sm:text-sm">Aligned with DigComp 2.1</p>
              <p className="mt-0.5 text-xs text-green-100/80 sm:text-sm">A five-area framework for digital competence.</p>
            </div>
          </div>
        </section>

        <section className="login-form-panel relative isolate order-1 flex min-h-[calc(100svh-1.5rem)] flex-col justify-center overflow-hidden bg-white/82 px-4 py-5 backdrop-blur-md sm:min-h-[calc(100svh-2.5rem)] sm:px-7 sm:py-7 lg:order-2 lg:min-h-0 lg:px-8 lg:py-6 xl:px-10">
          <div className={`login-form-wrap relative z-10 mx-auto w-full${wide ? ' login-form-wrap--wide' : ''}`}>
            <div className="login-card">
              {children}
            </div>

            <p className="login-institution-footer">Digital Literacy Assessment System · Masbate Colleges</p>
          </div>
        </section>
      </div>
    </main>
  );
}
