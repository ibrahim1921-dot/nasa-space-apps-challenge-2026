'use client';

// Crew Medical Officer view: every crew member at a glance, worst first, plus the newest flagged
// readings, built from the bundled synthetic data and the readings saved on this device. Never shows PhysioNet nights:
// they are general human data, not crew data.

import { useMemo } from 'react';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { crewFile, standFile } from '../data/bundled.js';
import { seedAll } from '../lib/seedRows.js';
import { buildCrewCards, flaggedFeed, mergeReadings, statusCounts } from '../lib/cmoSummary.js';
import { readAllStandTests } from '../lib/standTestStore.js';
import { readAllVitals } from '../lib/vitalsCheckinStore.js';
import { STATUS_LABELS } from '../constants/status.js';
import StatusChip from '../components/StatusChip.jsx';
import StatusIcon from '../components/StatusIcon.jsx';
import SourceLabel from '../components/SourceLabel.jsx';
import SyncBadge from '../components/SyncBadge.jsx';

const SOURCE_SERVER = 'Onboard server (synthetic crew data + readings synced from crew devices)';
const SOURCE_DEVICE = 'This device: bundled synthetic crew data + readings saved on this device (onboard server offline)';
const BASELINE_SERVER = 'Preflight baselines table (synthetic preflight average, crew.json)';
const BASELINE_DEVICE = 'Synthetic preflight average (crew.json, bundled)';
const KIND = { daily_vitals: 'Daily vitals', stand_test: 'Stand test' };

const stamp = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const isSeed = (r) => r?.payload?.origin === 'seed';

/** Device-only copy of the seeded database, computed once from the bundled files. */
let deviceSeed = null;
function getDeviceSeed() {
  if (!deviceSeed) {
    const s = seedAll(crewFile, standFile);
    deviceSeed = { crew: s.crew, baselines: s.baselines, readings: s.readings.map(({ key, ...r }) => ({ id: key, ...r })) };
  }
  return deviceSeed;
}

/**
 * Everyone's readings: the bundled synthetic crew data plus readings saved on this device.
 * TODO(frontend): when the backend serves GET /api/crew and GET /api/crew/{crewId}/summary,
 * load the whole crew from there when connected (see docs/api-contract.md).
 */
function useCmoData() {
  const { version } = useOnboard();
  const local = useMemo(() => [...readAllVitals(), ...readAllStandTests()], [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = getDeviceSeed();
  const readings = useMemo(() => mergeReadings(base.readings, local), [base, local]);
  return { fromServer: false, live: false, error: null, crew: base.crew, baselines: base.baselines, readings };
}

function Comparison({ rows }) {
  if (!rows.length) return <p className="muted cmo-card__none">No preflight baseline or reading yet.</p>;
  return (
    <dl className="cmo-compare">
      {rows.map((r) => {
        const worse = r.worseWhen === 'higher' ? r.change > 0 : r.change < 0;
        const sign = r.change > 0 ? '+' : r.change < 0 ? '−' : '±';
        return (
          <div key={r.id} className="cmo-compare__row">
            <dt>{r.label}</dt>
            <dd>
              <span className="num">{r.before}</span>
              <span className="cmo-compare__arrow" aria-label="then now">→</span>
              <span className="num">{r.now}</span> <span className="muted">{r.unit}</span>
              <span className={`cmo-compare__delta${worse && r.change !== 0 ? ' is-worse' : ''}`}>
                ({sign}
                {Math.abs(r.change)}
                {r.id === 'blood_pressure' ? ' systolic' : ''})
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function ReadingLine({ label, row, note }) {
  if (!row) {
    return (
      <div className="cmo-card__reading">
        <span className="cmo-card__reading-label">{label}</span>
        <span className="muted">No reading yet</span>
      </div>
    );
  }
  return (
    <div className="cmo-card__reading">
      <span className="cmo-card__reading-label">{label}</span>
      <StatusChip status={row.status} icon />
      <time className="muted cmo-card__time" dateTime={row.recorded_at}>
        {stamp(row.recorded_at)}
      </time>
      {note && <span className="chip chip--muted">{note}</span>}
      {!isSeed(row) && <SyncBadge record={row} />}
      {row.status !== 'normal' && row.reasons?.[0] && <p className="cmo-card__reason">{row.reasons[0]}</p>}
    </div>
  );
}

function CrewCard({ card }) {
  return (
    <li className={`cmo-card cmo-card--${card.status}`}>
      <div className="cmo-card__head">
        <div>
          <h3 className="cmo-card__name">{card.name}</h3>
          <p className="muted cmo-card__title">
            {card.title}
            {card.role === 'cmo' ? ' · CMO' : ''}
          </p>
        </div>
        <span className={`cmo-card__status status-text--${card.status}`}>
          <StatusIcon status={card.status} size={22} />
          {STATUS_LABELS[card.status]}
        </span>
      </div>
      <ReadingLine label="Vitals" row={card.vitals} />
      <ReadingLine
        label="Stand test"
        row={card.stand}
        note={card.standIsPreflight ? `Preflight ${card.stand.payload?.timepoint ?? ''}`.trim() : null}
      />
      <h4 className="cmo-card__sub">Preflight vs now</h4>
      <Comparison rows={card.comparison} />
    </li>
  );
}

export default function CrewMedicalOfficer() {
  const { fromServer, live, error, crew, baselines, readings } = useCmoData();
  const cards = useMemo(() => buildCrewCards({ crew, readings, baselines }), [crew, readings, baselines]);
  const feed = useMemo(() => flaggedFeed(readings, 12), [readings]);
  const counts = statusCounts(cards);
  const names = Object.fromEntries(crew.map((c) => [c.id, c.name]));

  return (
    <div className="cmo">
      <section className="card card--lg cmo__bar" aria-labelledby="cmo-title">
        <div className="cmo__bar-main">
          <p className="cmo__eyebrow">Mission control · {crew[0]?.mission ?? 'Demo mission'}</p>
          <h2 id="cmo-title" className="view-title">
            Crew Medical Officer
          </h2>
          <p className="muted">Every crew member’s latest vitals and stand test, worst first. Statuses come from the same checks the crew see.</p>
        </div>
        <ul className="cmo__counts" aria-label="Crew by status">
          {['alert', 'watch', 'normal'].map((s) => (
            <li key={s} className={`cmo__count status-text--${s}`}>
              <StatusIcon status={s} size={18} />
              <span className="num cmo__count-n">{counts[s]}</span>
              <span>{STATUS_LABELS[s]}</span>
            </li>
          ))}
        </ul>
        <p className={`cmo__live${live ? ' is-live' : ''}`} role="status">
          <span className="cmo__live-dot" aria-hidden="true" />
          {live ? 'Live: updates as crew log readings' : fromServer ? 'Connecting to live updates…' : 'Device copy: live updates resume when the onboard server is back'}
        </p>
        {error && (
          <p className="field__error" role="alert">
            Onboard server: {error}. Showing this device’s copy.
          </p>
        )}
      </section>

      <div className="cmo__layout">
        <section className="card card--lg" aria-labelledby="cmo-crew-title">
          <h3 id="cmo-crew-title" className="card__title">
            Crew status
          </h3>
          <ol className="cmo__cards">
            {cards.map((c) => (
              <CrewCard key={c.id} card={c} />
            ))}
          </ol>
          <SourceLabel source={`${fromServer ? SOURCE_SERVER : SOURCE_DEVICE} · Preflight: ${fromServer ? BASELINE_SERVER : BASELINE_DEVICE}`} />
        </section>

        <section className="card card--lg cmo__feed" aria-labelledby="cmo-feed-title">
          <h3 id="cmo-feed-title" className="card__title">
            Newest watch and alert readings
          </h3>
          {feed.length === 0 ? (
            <p className="muted">No watch or alert readings.</p>
          ) : (
            <ol className="cmo-feed">
              {feed.map((r) => (
                <li key={r.id} className={`cmo-feed__item cmo-feed__item--${r.status}`}>
                  <div className="cmo-feed__head">
                    <StatusChip status={r.status} icon />
                    <strong>{names[r.crew_id] ?? r.crew_id}</strong>
                    <span className="muted">{KIND[r.kind]}</span>
                    <time className="muted cmo-feed__time" dateTime={r.recorded_at}>
                      {stamp(r.recorded_at)}
                    </time>
                    {!isSeed(r) && <SyncBadge record={r} />}
                  </div>
                  <ul className="cmo-feed__reasons">
                    {(r.reasons ?? []).slice(0, 3).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          <SourceLabel source={fromServer ? SOURCE_SERVER : SOURCE_DEVICE} />
        </section>
      </div>
    </div>
  );
}
