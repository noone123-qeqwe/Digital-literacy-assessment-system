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

async function decodeIntroImage(image) {
  if (!image || typeof image.decode !== 'function') throw new Error('Image decoding is unavailable');
  await image.decode();
}

export default function LoginIntro({ children, skipIntro = false }) {
  const [phase, setPhase] = useState(() => shouldPlayIntro(skipIntro) ? 'preparing' : 'idle');
  const isActive = !['idle', 'finished'].includes(phase);
  const isReady = isActive && phase !== 'preparing';
  const isCovered = phase === 'preparing' || phase === 'playing';
  const pageRef = useRef(null);
  const skipRef = useRef(null);
  const campusRef = useRef(null);
  const logoRef = useRef(null);
  const shouldMoveFocus = useRef(false);

  const finishIntro = useCallback(() => {
    try { sessionStorage.setItem(INTRO_SEEN_KEY, '1'); } catch { /* Storage can be unavailable in private browsers. */ }
    shouldMoveFocus.current = true;
    setPhase('finished');
  }, []);

  useEffect(() => {
    if (!isActive) {
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
    const timeout = window.setTimeout(finishIntro, 5000);

    return () => {
      document.body.style.overflow = previousOverflow;
      motionPreference.removeEventListener('change', onMotionChange);
      window.clearTimeout(timeout);
    };
  }, [isActive, finishIntro]);

  useEffect(() => {
    let cancelled = false;
    let frame;
    let timeout;

    if (phase === 'preparing') {
      // Start the timeline only after both images are downloaded, decoded and
      // given a paint opportunity. A slow/failed image must never block sign-in.
      timeout = window.setTimeout(finishIntro, 1500);
      Promise.all([decodeIntroImage(campusRef.current), decodeIntroImage(logoRef.current)])
        .then(() => {
          if (cancelled) return;
          frame = window.requestAnimationFrame(() => {
            frame = window.requestAnimationFrame(() => {
              if (!cancelled) setPhase('playing');
            });
          });
        })
        .catch(() => { if (!cancelled) finishIntro(); });
    } else if (phase === 'playing') {
      timeout = window.setTimeout(() => setPhase('revealing'), 2350);
    } else if (phase === 'revealing') {
      // Paint the login page underneath the opaque intro before the fade.
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => setPhase('leaving'));
      });
      timeout = window.setTimeout(() => setPhase('leaving'), 150);
    } else if (phase === 'leaving') {
      timeout = window.setTimeout(finishIntro, 350);
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [phase, finishIntro]);

  return <>
    <div ref={pageRef} className={`login-intro-page${isCovered ? ' login-intro-page--covered' : ''}`} inert={isActive} aria-hidden={isActive ? true : undefined}>
      {children}
    </div>
    {isActive && <section
      className={`login-intro login-intro--${phase}${isReady ? ' login-intro--ready' : ''}`}
      data-phase={phase}
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
        <img ref={campusRef} src="/masbate-colleges-campus-login.webp" alt="" decoding="async" fetchPriority="high" className="login-intro-campus" />
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
          <img ref={logoRef} src="/masbate-colleges-logo-login.webp" alt="" decoding="async" fetchPriority="high" />
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
