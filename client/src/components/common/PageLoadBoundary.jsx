import React from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';

export default class PageLoadBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="flex min-h-svh items-center justify-center bg-slate-50 px-4 py-10">
      <section role="alert" className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <img src="/masbate-colleges-icon.png" alt="Masbate Colleges" className="mb-5 h-12 w-12 rounded-xl" />
        <p className="text-xs font-bold uppercase tracking-widest text-green-700">DLAS Portal</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">This page couldn’t open</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">Reload this page to try again with the latest version. If it still won’t open, return to sign in and try again.</p>
        <div className="mt-6 flex flex-col gap-3">
          <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green-700 px-4 font-semibold text-white hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"><RefreshCw size={18} aria-hidden="true" />Reload this page</button>
          <a href="/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"><ArrowLeft size={17} aria-hidden="true" />Return to sign in</a>
        </div>
      </section>
    </main>;
  }
}
