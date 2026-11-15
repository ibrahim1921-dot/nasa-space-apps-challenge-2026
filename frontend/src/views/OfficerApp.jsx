'use client';

// The ground medical officer's app (backend role NASA_OFFICER). Officers have no astronaut profile, so
// there are no personal health screens: crew roster, alerts, baselines, rules, plus the knowledge hub and
// the (demo) ML assessment. The onboard Crew Medical Officer is Lena (crew-03), an ASTRONAUT account,
// and keeps the onboard CMO view in the crew app.

import { useCallback, useEffect, useState } from 'react';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { canOpen, homeFor, tabsFor } from '../lib/appScreens.js';
import { listCrew } from '../services/crewService.js';
import MoreMenu from '../components/MoreMenu.jsx';
import AccountMenu from '../components/AccountMenu.jsx';
import OnboardStatus from '../components/OnboardStatus.jsx';
import OfficerCrew from './OfficerCrew.jsx';
import Alerts from './Alerts.jsx';
import Baselines from './Baselines.jsx';
import Rules from './Rules.jsx';
import KnowledgeHub from './KnowledgeHub.jsx';
import Assessment from './Assessment.jsx';

const FOOTER = {
  officerCrew: 'Roster and open alerts are live from the backend. Health statuses are local simulated data for a fictional crew.',
  officerAlerts: 'Alerts are live from the backend. Records the backend marks synthetic are labelled "Synthetic / not clinical".',
  baselines: 'Live from the backend, read only. Personal references are not clinical limits.',
  rules: 'Live from the backend, read only.',
  knowledge: 'Text from the app’s cited sources; gaps are marked TODO. Images are placeholders.',
  assessment: 'Demo data: the model is not connected yet.',
};

/** GET /api/crew, shared by every officer screen. */
function useRoster() {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ loading: false, error: null, data: await listCrew() });
    } catch (error) {
      setState({ loading: false, error, data: null });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

export default function OfficerApp() {
  const { account } = useOnboard();
  const tabs = tabsFor(account);
  const [view, setView] = useState(homeFor(account));
  const [alertsFor, setAlertsFor] = useState({ id: '', n: 0 });
  const roster = useRoster();

  useEffect(() => {
    if (!canOpen(account, view)) setView(homeFor(account));
  }, [view, account]);

  function go(id) {
    setView(id);
    window.scrollTo(0, 0);
  }

  function openAlertsFor(astronautId) {
    setAlertsFor((a) => ({ id: astronautId, n: a.n + 1 }));
    go('officerAlerts');
  }

  return (
    <>
      <header className="header">
        <div className="container header__inner">
          <div className="header__brand">
            <h1 className="header__title">Crew health monitor</h1>
          </div>
          <div className="header__crew">
            <p className="header__signed-in">
              <span className="muted">Signed in as</span> <strong className="header__name">{account.name}</strong>
              <span className="muted"> · {account.title}</span>
            </p>
          </div>
        </div>
        <div className="container header__onboard">
          <OnboardStatus />
          <div className="header__controls">
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="container main">
        <nav className="viewtabs" aria-label="Views">
          {tabs.map((t) =>
            t.items ? (
              <MoreMenu key={t.id} items={t.items} view={view} onSelect={go} />
            ) : (
              <button
                key={t.id}
                type="button"
                className={`viewtabs__tab${view === t.id ? ' is-active' : ''}`}
                aria-current={view === t.id ? 'page' : undefined}
                onClick={() => go(t.id)}
              >
                {t.label}
              </button>
            ),
          )}
        </nav>

        {view === 'officerCrew' && <OfficerCrew roster={roster} onOpenAlerts={openAlertsFor} />}
        {view === 'officerAlerts' && <Alerts key={alertsFor.n} officer crew={roster.data ?? []} initialAstronautId={alertsFor.id} />}
        {view === 'baselines' && <Baselines roster={roster} />}
        {view === 'rules' && <Rules roster={roster} />}
        {view === 'knowledge' && <KnowledgeHub />}
        {view === 'assessment' && <Assessment roster={roster} />}
      </main>

      <footer className="container footer">
        <p className="footer__disclaimer">Prototype for decision support. Not a medical device and not a diagnosis.</p>
        <p>{FOOTER[view] ?? ''}</p>
      </footer>
    </>
  );
}
