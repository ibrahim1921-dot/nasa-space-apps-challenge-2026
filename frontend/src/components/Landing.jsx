'use client';

import { useEffect, useRef } from 'react';
import { DEMO_ACCOUNTS } from '../lib/demoAccounts.js';
import { useOnboard } from '../hooks/useOnboard.jsx';

const ROLE_NOTE = {
  maya: 'Flight engineer · her own dashboard, check-ins and stand tests',
  lena: 'Crew medical officer · her own dashboard plus the whole-crew view',
};

/** Signed-out state: what the app is, and the two demo doors. No sign-up, no password. */
export default function Landing() {
  const { enter, busy, server } = useOnboard();
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="landing">
      <section className="card card--lg landing__panel" aria-labelledby="landing-title">
        <p className="cmo__eyebrow">Demo mission</p>
        <h1 id="landing-title" ref={headingRef} tabIndex={-1} className="landing__title">
          Crew health monitor
        </h1>
        <p className="landing__lede">
          Daily vitals and stand tests for a spaceflight crew, checked on the device against each person’s own baseline
          and published limits, with a whole-crew view for the Crew Medical Officer.
        </p>

        <div className="landing__doors" role="group" aria-label="Choose a demo person">
          {Object.values(DEMO_ACCOUNTS).map((a) => (
            <button
              key={a.who}
              type="button"
              className="landing__door"
              onClick={() => enter(a.who)}
              disabled={busy}
            >
              <span className="landing__door-name">{a.button}</span>
              <span className="landing__door-note">{ROLE_NOTE[a.who]}</span>
            </button>
          ))}
        </div>

        <p className="muted landing__note">
          Demo accounts: one click, no sign-up and no password.{' '}
          {server === 'mock'
            ? 'Demo mode: runs on its own mock data.'
            : server === 'connected'
            ? 'Onboard server: connected.'
            : server === 'offline'
              ? 'Onboard server offline: everything is saved on this device.'
              : ''}
        </p>
      </section>
      <p className="landing__foot muted">
        Crew data is synthetic, for a fictional crew. Sleep nights are general human data from PhysioNet; lab values
        are from NASA’s Inspiration4 mission.
      </p>
    </main>
  );
}
