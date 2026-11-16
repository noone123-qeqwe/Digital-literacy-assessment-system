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
  const [assets, setAssets] = useState({ campus: false, logo: false });
  const [playbackDuration] = useState(() => window.matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 499px)').matches ? 1850 : 2350);
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
        shouldMoveFocus.current = false;
        // Let the formerly hidden page paint before focusing it. This also
        // handles an immediate exit caused by a motion-preference change.
        let frame = window.requestAnimationFrame(() => {
          frame = window.requestAnimationFrame(() => {
            pageRef.current?.querySelector('[data-login-heading]')?.focus({ preventScroll: true });
          });
        });
        return () => window.cancelAnimationFrame(frame);
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
      // Show the brand immediately. Use only assets decoded within this short
      // window, so a slow mobile connection cannot cause a late background pop.
      const decoded = { campus: false, logo: false };
      let started = false;
      const startPlayback = () => {
        if (cancelled || started) return;
        started = true;
        window.clearTimeout(timeout);
        setAssets({ ...decoded });
        frame = window.requestAnimationFrame(() => {
          if (!cancelled) setPhase('playing');
        });
      };
      timeout = window.setTimeout(startPlayback, 350);
      Promise.allSettled([
        decodeIntroImage(campusRef.current).then(() => { decoded.campus = true; }),
        decodeIntroImage(logoRef.current).then(() => { decoded.logo = true; }),
      ]).then(startPlayback);
    } else if (phase === 'playing') {
      timeout = window.setTimeout(() => setPhase('revealing'), playbackDuration);
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
  }, [phase, finishIntro, playbackDuration]);

  return <>
    <div ref={pageRef} className={`login-intro-page${isCovered ? ' login-intro-page--covered' : ''}`} inert={isActive} aria-hidden={isActive ? true : undefined}>
      {children}
    </div>
    {isActive && <section
      className={`login-intro login-intro--${phase}${isReady ? ' login-intro--ready' : ''}`}
      data-phase={phase}
      data-campus-ready={assets.campus}
      data-logo-ready={assets.logo}
      style={{ '--login-intro-duration': `${playbackDuration}ms` }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-intro-title"
      aria-describedby="login-intro-description"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === 'login-intro-exit') finishIntro();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); finishIntro(); }
        if (event.key === 'Tab') {
          const buttons = [...event.currentTarget.querySelectorAll('button')].filter((button) => button.getClientRects().length > 0);
          const index = buttons.indexOf(document.activeElement);
          const nextIndex = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
          event.preventDefault();
          buttons[nextIndex]?.focus();
        }
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
          <span className="login-intro-monogram">MC</span>
          <img ref={logoRef} src="/masbate-colleges-logo-login.webp" alt="" decoding="async" fetchPriority="high" />
        </div>
        <p className="login-intro-eyebrow">Welcome to your digital journey</p>
        <h1 id="login-intro-title">Masbate Colleges</h1>
        <p className="login-intro-system">Digital Literacy<br className="login-intro-mobile-break" /> Assessment System</p>
        <p id="login-intro-description" className="login-intro-tagline">Know your skills. Grow your confidence.</p>
      </div>
      <footer className="login-intro-footer">
        <button type="button" className="login-intro-continue" onClick={finishIntro}>Continue to sign in<ArrowRight aria-hidden="true" size={17} /></button>
        <div className="login-intro-progress" aria-hidden="true"><span /></div>
        <p className="login-intro-steps" aria-hidden="true">Assess<span>·</span>Discover<span>·</span>Grow</p>
        <p className="login-intro-auto" aria-hidden="true">Sign-in opens automatically</p>
      </footer>
    </section>}
  </>;
}
