'use client';

// Signed-out screen. Real login against the backend (POST /api/auth/login via lib/api.js): login name
// and password only, as docs/demo-account-provisioning.md says. The backend decides the role; nothing
// here can pick it. If the backend is not reachable, "Explore with demo data" opens the local demo crew,
// labelled as demo data. Look: teammate commits 38f6c67 / 26f3be5 (StellarHealth).

import { useEffect, useRef, useState } from 'react';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { api, validateLogin } from '../lib/api.js';
import { LOGIN_MEDIA } from '../lib/loginMedia.js';
import { MOCK_CREW } from '../lib/mockCrewLogin.js';
import EmergencyButton from './EmergencyButton.jsx';

const PROVISIONING_DOC = 'docs/demo-account-provisioning.md';
const DEMO_LOGIN_NAMES = ['maya.demo', 'tomas.demo', 'lena.demo', 'kwame.demo', 'officer.demo'];

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
      <circle cx="71" cy="76" r="2" fill="#172538" />
      <circle cx="89" cy="76" r="2" fill="#172538" />
      <path d="M74 89q6 5 12 0" fill="none" stroke="#392b31" strokeWidth="2" strokeLinecap="round" />
      <path d="M45 47q-13 25 0 49" stroke="white" strokeOpacity="0.5" strokeWidth="4" fill="none" strokeLinecap="round" />
      <rect x="59" y="128" width="42" height="23" rx="5" fill="#172538" />
      <path d="M66 140h7l4-6 5 12 4-6h8" fill="none" stroke={person.color} strokeWidth="2" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M10 2 19 18H1z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DemoPicker({ onBack }) {
  const { enter, busy } = useOnboard();
  const headingRef = useRef(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div className="crew-login">
      <button type="button" className="crew-login__back" onClick={onBack}>
        <span aria-hidden="true">←</span> Back to sign in
      </button>
      <p>
        <span className="demo-tag">Demo data</span>
      </p>
      <h2 className="crew-login__heading" ref={headingRef} tabIndex={-1}>
        Explore with demo data
      </h2>
      <p className="crew-login__intro">
        A fictional crew with synthetic records, on this device only. No backend, no alerts from the server. Pick a person to
        explore as.
      </p>
      <div className="crew-login__grid">
        {MOCK_CREW.map((person) => (
          <button key={person.who} type="button" className="crew-login__card" onClick={() => enter(person.who)} disabled={busy}>
            <CrewPortrait person={person} />
            <span className="crew-login__name">{person.name}</span>
            <span className="crew-login__role">{person.role}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LoginForm({ onExplore }) {
  const { login, busy, server, notice } = useOnboard();
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState({});
  const [error, setError] = useState(notice);
  const [checking, setChecking] = useState(false);
  const [reachable, setReachable] = useState(server !== 'offline');
  const nameRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => setReachable(server !== 'offline'), [server]);

  async function retry() {
    setChecking(true);
    const ok = await api.ping();
    setReachable(ok);
    setChecking(false);
    if (ok) setError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const problems = validateLogin({ loginName, password });
    setFields(problems);
    if (problems.loginName) return nameRef.current?.focus();
    if (problems.password) return passwordRef.current?.focus();
    setError(null);
    try {
      await login(loginName, password);
      setPassword('');
    } catch (err) {
      setPassword('');
      if (err?.kind === 'unreachable') setReachable(false);
      setError(err?.message ?? 'Sign-in failed. Try again.');
      passwordRef.current?.focus();
    }
  }

  return (
    <>
      <form className="landing__form" onSubmit={handleSubmit} noValidate aria-busy={busy}>
        <label className="landing__field" htmlFor="login-name">
          Login name
          <input
            ref={nameRef}
            id="login-name"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            aria-invalid={Boolean(fields.loginName)}
            aria-describedby={fields.loginName ? 'login-name-error' : undefined}
            disabled={busy}
            required
          />
          {fields.loginName && (
            <p id="login-name-error" className="landing__field-error">
              {fields.loginName}
            </p>
          )}
        </label>
        <label className="landing__field" htmlFor="login-password">
          Password
          <input
            ref={passwordRef}
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fields.password)}
            aria-describedby={fields.password ? 'login-password-error' : undefined}
            disabled={busy}
            required
          />
          {fields.password && (
            <p id="login-password-error" className="landing__field-error">
              {fields.password}
            </p>
          )}
        </label>
        {error && (
          <p className="landing__error" role="alert">
            {error}
          </p>
        )}
        <button className="landing__submit" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {!reachable && (
        <div className="landing__offline" role="status">
          <p className="landing__offline-title">
            <WarningIcon /> Backend not reachable
          </p>
          <p>Sign-in needs the team&apos;s backend. You can still explore the app with local demo data.</p>
          <div className="landing__actions">
            <button type="button" className="landing__secondary" onClick={onExplore}>
              Explore with demo data
            </button>
            <button type="button" className="landing__secondary" onClick={retry} disabled={checking}>
              {checking ? 'Checking…' : 'Try again'}
            </button>
          </div>
        </div>
      )}

      <details className="landing__help">
        <summary>How to get demo accounts</summary>
        <p>
          Accounts are created by the team&apos;s administrator with the backend&apos;s provisioning command, described in{' '}
          <code>{PROVISIONING_DOC}</code>. There is no sign-up. The fictional demo login names are:
        </p>
        <ul>
          {DEMO_LOGIN_NAMES.map((n) => (
            <li key={n}>
              <code>{n}</code>
              {n === 'officer.demo' ? ' (ground medical officer)' : ' (astronaut)'}
            </li>
          ))}
        </ul>
        <p>Passwords are chosen when the accounts are created and are delivered privately. They are never stored in this app.</p>
      </details>
    </>
  );
}

export default function Landing() {
  const headingRef = useRef(null);
  const [exploring, setExploring] = useState(false);

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
      {LOGIN_MEDIA.background && <img className="landing__background" src={LOGIN_MEDIA.background} alt="" aria-hidden="true" />}
      <div className="landing__topbar">
        <EmergencyButton />
      </div>
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
        {exploring ? <DemoPicker onBack={() => setExploring(false)} /> : <LoginForm onExplore={() => setExploring(true)} />}
      </section>
      <p className="landing__foot">
        Crew data is synthetic, for a fictional crew. Prototype for decision support: not a medical device and not a diagnosis.
      </p>
    </main>
  );
}
