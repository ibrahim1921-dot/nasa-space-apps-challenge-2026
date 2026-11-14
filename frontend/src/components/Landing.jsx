'use client';

import { useEffect, useRef, useState } from 'react';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { LOGIN_MEDIA } from '../lib/loginMedia.js';

export default function Landing() {
  const { enter, busy } = useOnboard();
  const headingRef = useRef(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(event) {
    event.preventDefault();
    if (submitting || busy) return;
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      // Frontend preview only; credentials are not authenticated or persisted.
      enter('maya');
      setPassword('');
    } catch {
      setError('Unable to open your profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="landing">
      <svg width="0" height="0" className="landing__filters" aria-hidden="true" focusable="false">
        <defs>
          <filter id="landing-logo-transparency" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  1 1 1 0 0" />
          </filter>
        </defs>
      </svg>
      {LOGIN_MEDIA.background && (
        <img className="landing__background" src={LOGIN_MEDIA.background} alt="" aria-hidden="true" />
      )}
      <section className="landing__panel" aria-labelledby="landing-title">
        <div className="landing__brand">
          <span className="landing__icon" aria-hidden="true">
            {LOGIN_MEDIA.icon ? (
              <img src={LOGIN_MEDIA.icon} alt="" />
            ) : (
              <svg viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1.5" />
                <ellipse cx="24" cy="24" rx="23" ry="8" transform="rotate(-35 24 24)" stroke="currentColor" strokeWidth="1.5" />
                <path d="m15 24 5 0 3-7 4 14 3-7h4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <h1 id="landing-title" ref={headingRef} tabIndex={-1} className="landing__title">
            StellarHealth
          </h1>
        </div>
        <form className="landing__form" onSubmit={handleLogin} aria-busy={submitting}>
        <label className="landing__field" htmlFor="login-name">
          Name
          <input id="login-name" name="username" autoComplete="username" value={name} onChange={(event) => setName(event.target.value)} required disabled={submitting} />
        </label>
        <label className="landing__field" htmlFor="login-password">
          Password
          <input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={submitting} />
        </label>
        {error && <p className="landing__error" role="alert">{error}</p>}
        <button className="landing__submit" type="submit" disabled={busy || submitting}>
          {submitting ? 'Logging in…' : 'Login'}
        </button>
        </form>
      </section>
    </main>
  );
}
