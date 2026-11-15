import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import './LoginIntro.css';

const INTRO_SEEN_KEY = 'dlas:login-intro:seen:v1';

function shouldPlayIntro(skipIntro) {
  if (skipIntro || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

export default function LoginIntro({ children, skipIntro = false }) {
  const [phase, setPhase] = useState(() => shouldPlayIntro(skipIntro) ? 'playing' : 'idle');
  const isPlaying = phase === 'playing';
  const pageRef = useRef(null);
  const skipRef = useRef(null);
  const shouldMoveFocus = useRef(false);

  const finishIntro = useCallback(() => {
    try { sessionStorage.setItem(INTRO_SEEN_KEY, '1'); } catch { /* Storage can be unavailable in private browsers. */ }
    shouldMoveFocus.current = true;
    setPhase('finished');
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (shouldMoveFocus.current) {
        pageRef.current?.querySelector('[data-login-heading]')?.focus({ preventScroll: true });
        shouldMoveFocus.current = false;
      }
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    skipRef.current?.focus({ preventScroll: true });
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = (event) => { if (event.matches) finishIntro(); };
    motionPreference.addEventListener('change', onMotionChange);
    // Always release the login page even if an animation-end event is missed.
    const timeout = window.setTimeout(finishIntro, 3600);

    return () => {
      document.body.style.overflow = previousOverflow;
      motionPreference.removeEventListener('change', onMotionChange);
      window.clearTimeout(timeout);
    };
  }, [isPlaying, finishIntro]);

  return <>
    <div ref={pageRef} className={`login-intro-page${phase === 'finished' ? ' login-intro-page--revealed' : ''}`} inert={isPlaying} aria-hidden={isPlaying ? true : undefined}>
      {children}
    </div>
    {isPlaying && <section
      className="login-intro"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-intro-title"
      aria-describedby="login-intro-description"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === 'login-intro-exit') finishIntro();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); finishIntro(); }
        if (event.key === 'Tab') { event.preventDefault(); skipRef.current?.focus(); }
      }}
    >
      <div className="login-intro-scene" aria-hidden="true">
        <img src="/masbate-colleges-campus.jpg" alt="" className="login-intro-campus" />
        <div className="login-intro-grid" />
        <div className="login-intro-light" />
        <div className="login-intro-horizon" />
      </div>
      <header className="login-intro-header">
        <p><strong>DLAS</strong><span>College of Computer Studies</span></p>
        <button ref={skipRef} type="button" className="login-intro-skip" onClick={finishIntro}>Skip intro<ArrowRight aria-hidden="true" size={16} /></button>
      </header>
      <div className="login-intro-content">
        <div className="login-intro-emblem" aria-hidden="true">
          <span className="login-intro-orbit" />
          <span className="login-intro-orbit login-intro-orbit--outer" />
          <img src="/masbate-colleges-logo.png" alt="" />
        </div>
        <p className="login-intro-eyebrow">Learn with purpose. Lead with confidence.</p>
        <h1 id="login-intro-title">Masbate Colleges</h1>
        <p className="login-intro-system">Digital Literacy<br className="login-intro-mobile-break" /> Assessment System</p>
        <p id="login-intro-description" className="login-intro-tagline">Know your skills. Grow your confidence.</p>
      </div>
      <footer className="login-intro-footer" aria-hidden="true">
        <div className="login-intro-progress"><span /></div>
        <p>Assess<span>·</span>Discover<span>·</span>Grow</p>
      </footer>
    </section>}
  </>;
}
