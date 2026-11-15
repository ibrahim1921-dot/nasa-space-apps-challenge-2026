'use client';

import { useEffect, useRef, useState } from 'react';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { LOGIN_MEDIA } from '../lib/loginMedia.js';
import { MOCK_CREW, matchesMockPin } from '../lib/mockCrewLogin.js';

function CrewPortrait({ person }) {
  return (
    <svg viewBox="0 0 160 160" role="img" aria-label={`${person.name}, astronaut illustration`}>
      <rect width="160" height="160" rx="24" fill={person.color} fillOpacity="0.14" />
      <circle cx="125" cy="30" r="3" fill={person.color} />
      <path d="M25 36h12m-6-6v12" stroke={person.color} strokeWidth="2" />
      <path d="M28 160v-14c0-31 23-48 52-48s52 17 52 48v14" fill="#dce8f2" />
      <circle cx="80" cy="73" r="48" fill="#dce8f2" />
      <circle cx="80" cy="73" r="39" fill="#172538" />
      <ellipse cx="80" cy="76" rx="25" ry="29" fill={person.skin} />
      <path d="M55 66c0-30 50-34 50 0-12-3-23-9-30-17-4 9-10 14-20 17" fill="#27232b" />
      <circle cx="71" cy="76" r="2" fill="#172538" /><circle cx="89" cy="76" r="2" fill="#172538" />
      <path d="M74 89q6 5 12 0" fill="none" stroke="#392b31" strokeWidth="2" strokeLinecap="round" />
      <path d="M45 47q-13 25 0 49" stroke="white" strokeOpacity="0.5" strokeWidth="4" fill="none" strokeLinecap="round" />
      <rect x="59" y="128" width="42" height="23" rx="5" fill="#172538" />
      <path d="M66 140h7l4-6 5 12 4-6h8" fill="none" stroke={person.color} strokeWidth="2" />
    </svg>
  );
}

export default function Landing() {
  const { enter, busy } = useOnboard();
  const headingRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const pinRef = useRef(null);
  const cardRefs = useRef({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(event) {
    event.preventDefault();
    if (submitting || busy) return;
    if (!selected || !matchesMockPin(selected.who, pin)) {
      setError('Incorrect PIN. Please try again.');
      setPin('');
      pinRef.current?.focus();
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      // Frontend preview only; credentials are not authenticated or persisted.
      enter(selected.who);
      setPin('');
    } catch {
      setError('Unable to open your profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (selected) pinRef.current?.focus();
  }, [selected]);

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
        {!selected ? (
          <div className="crew-login">
            <h2 className="crew-login__heading">Welcome aboard</h2>
            <p className="crew-login__intro">Select your card to sign in.</p>
            <div className="crew-login__grid">
              {MOCK_CREW.map((person) => (
                <button key={person.who} ref={(node) => { cardRefs.current[person.who] = node; }} type="button" className="crew-login__card" onClick={() => { setSelected(person); setPin(''); setError(''); }} disabled={busy}>
                  <CrewPortrait person={person} />
                  <span className="crew-login__name">{person.name}</span>
                  <span className="crew-login__role">{person.role}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form className="landing__form crew-login__pin" onSubmit={handleLogin} aria-busy={submitting}>
            <button type="button" className="crew-login__back" onClick={() => {
              const who = selected.who;
              setSelected(null); setPin(''); setError('');
              requestAnimationFrame(() => cardRefs.current[who]?.focus());
            }} disabled={submitting}>Back to crew</button>
            <div className="crew-login__selected">
              <CrewPortrait person={selected} />
              <h2 className="crew-login__heading">{selected.name}</h2>
              <p className="crew-login__intro">{selected.role}</p>
            </div>
            <label className="landing__field" htmlFor="login-pin">
              Enter your 4-digit PIN
              <input ref={pinRef} id="login-pin" name="pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" minLength={4} maxLength={4} value={pin} onChange={(event) => { setPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 4)); setError(''); }} required disabled={submitting} aria-describedby="mock-pin-hint" aria-invalid={Boolean(error)} />
            </label>
            <p id="mock-pin-hint" className="crew-login__hint">Mock preview PIN: <strong>{selected.pin}</strong></p>
            {error && <p className="landing__error" role="alert">{error}</p>}
            <button className="landing__submit" type="submit" disabled={busy || submitting || pin.length !== 4}>
              {submitting ? 'Logging in...' : 'Login'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
