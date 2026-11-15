'use client';

// The flight surgeon's console: header, emergency band, sidebar and the current view. Views live in
// the URL hash (#/overview, #/crew/<id>, #/emergencies, #/messages, #/station), so Back works and a
// view can be linked to without changing the app's routes.

import { useCallback, useEffect, useState } from 'react';
import { useGroundData } from '../hooks/useGroundData.js';
import { utcText } from './GroundBits.jsx';
import CrewOverview from './CrewOverview.jsx';
import CrewDetail from './CrewDetail.jsx';
import EmergencyPanel from './EmergencyPanel.jsx';
import MessagesPanel from './MessagesPanel.jsx';
import StationPanel from './StationPanel.jsx';
import PrintSummary from './PrintSummary.jsx';

const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'emergencies', label: 'Emergencies' },
  { id: 'messages', label: 'Messages' },
  { id: 'station', label: 'Station' },
];

const EMPTY_DRAFT = { to: 'cmo', subject: '', body: '', priority: 'routine', related: { kind: null, id: null } };

function parseHash(hash) {
  const [view = 'overview', id = null] = hash.replace(/^#\/?/, '').split('/');
  if (view === 'crew' && id) return { view: 'crew', id };
  return { view: NAV.some((n) => n.id === view) ? view : 'overview', id: null };
}

function useRoute() {
  const [route, setRoute] = useState({ view: 'overview', id: null });
  useEffect(() => {
    const read = () => setRoute(parseHash(window.location.hash));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const go = useCallback((view, id = null) => {
    window.location.hash = id ? `#/${view}/${id}` : `#/${view}`;
  }, []);
  return [route, go];
}

function Header({ info }) {
  return (
    <header className="gr-header">
      <div className="gr-header__row">
        <span className="gr-pill">GROUND</span>
        <h1 className="gr-header__title">Mission Control · Flight surgeon</h1>
        {info && (
          <div className="gr-header__meta">
            <span className="gr-header__delay">{info.delayLabel}</span>
            <span className="gr-muted">Demo day {info.today}</span>
          </div>
        )}
      </div>
      <p className="gr-demo-note">Demo: reads this browser&apos;s data. Live link to the onboard server comes later.</p>
    </header>
  );
}

function Band({ band, onOpen }) {
  if (!band) return null;
  return (
    <div className={`gr-band gr-band--${band.kind}`} role="region" aria-label={band.kind === 'drill' ? 'Emergency drill in progress' : 'Emergency in progress'}>
      <span className="gr-band__mark" aria-hidden="true">
        !
      </span>
      <span className="gr-band__text">
        {band.text}
        {band.count > 1 && <span className="gr-band__more"> · {band.count} open</span>}
      </span>
      <button type="button" className="gr-btn gr-btn--band" onClick={onOpen}>
        Follow the emergency
      </button>
    </div>
  );
}

export default function GroundConsole() {
  const { source, version, data, refresh } = useGroundData();
  const [route, go] = useRoute();
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  /** Open the composer pre-filled (e.g. "Reply to CMO about this"). */
  const compose = useCallback(
    (partial) => {
      setDraft({ ...EMPTY_DRAFT, ...partial });
      go('messages');
    },
    [go],
  );

  const openCount = data?.emergencies?.filter((e) => e.open).length ?? 0;
  const transitCount = data?.messages?.filter((m) => m.status.state === 'transit').length ?? 0;
  const active = route.view === 'crew' ? 'overview' : route.view;

  let view;
  if (!data) view = <p className="gr-muted gr-loading">Reading this browser&apos;s data…</p>;
  else if (data.error) view = <p className="gr-error" role="alert">{data.error}</p>;
  else if (route.view === 'crew') view = <CrewDetail source={source} version={version} crewId={route.id} info={data.info} onBack={() => go('overview')} onCompose={compose} />;
  else if (route.view === 'emergencies') view = <EmergencyPanel emergencies={data.emergencies} onCompose={compose} />;
  else if (route.view === 'messages') view = <MessagesPanel source={source} messages={data.messages} draft={draft} setDraft={setDraft} info={data.info} onSent={refresh} />;
  else if (route.view === 'station') view = <StationPanel />;
  else view = <CrewOverview crew={data.crew} info={data.info} onOpen={(id) => go('crew', id)} />;

  return (
    <div className="gr-console">
      <div className="gr-screen">
        <a className="gr-skip" href="#gr-main">
          Skip to content
        </a>
        <Header info={data?.info} />
        <Band band={data?.band} onOpen={() => go('emergencies')} />
        <div className="gr-shell">
          <nav className="gr-nav" aria-label="Console">
            <ul>
              {NAV.map((n) => (
                <li key={n.id}>
                  <a href={`#/${n.id}`} className={`gr-nav__link${active === n.id ? ' is-active' : ''}`} aria-current={active === n.id ? 'page' : undefined}>
                    {n.label}
                    {n.id === 'emergencies' && openCount > 0 && <span className="gr-count gr-count--alert">{openCount} open</span>}
                    {n.id === 'messages' && transitCount > 0 && <span className="gr-count">{transitCount} in transit</span>}
                  </a>
                </li>
              ))}
            </ul>
            <p className="gr-nav__foot gr-muted">
              Times in UTC.
              <br />
              Updated {data?.info ? utcText(new Date().toISOString()) : '…'}
            </p>
          </nav>
          <main id="gr-main" className="gr-main" tabIndex={-1}>
            {view}
          </main>
        </div>
      </div>
      {route.view === 'crew' && source && data && !data.error && <PrintSummary source={source} version={version} crewId={route.id} />}
    </div>
  );
}
