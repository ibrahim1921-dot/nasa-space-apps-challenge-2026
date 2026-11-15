'use client';

// Crew Medical Officer view: every crew member at a glance, worst first, plus the newest flagged
// readings, built on this device from the bundled synthetic data and the readings saved here (local). Never shows PhysioNet nights:
// they are general human data, not crew data.

import { useMemo } from 'react';
import { useOnboard } from '../hooks/useOnboard.jsx';
import EmergencyList from '../components/EmergencyList.jsx';
import { crewDaysOf, crewFile, standFile } from '../data/bundled.js';
import { useDemo } from '../hooks/useDemo.js';
import { onOrBefore } from '../lib/demoState.js';
import { sensorDaysFor } from '../lib/deviceScoring.js';
import { isSensorRecord, sensorRecords } from '../lib/sensorRecords.js';
import { recordChips } from '../lib/provenance.js';
import { ProvenanceChips } from '../components/ProvenanceChip.jsx';
import { seedAll } from '../lib/seedRows.js';
import { buildCrewCards, flaggedFeed, mergeReadings, statusCounts } from '../lib/cmoSummary.js';
import { readAllStandTests } from '../lib/standTestStore.js';
import { readAllVitals } from '../lib/vitalsCheckinStore.js';
import { STATUS_LABELS } from '../constants/status.js';
import StatusChip from '../components/StatusChip.jsx';
import StatusIcon from '../components/StatusIcon.jsx';
import SourceLabel from '../components/SourceLabel.jsx';
import SyncBadge from '../components/SyncBadge.jsx';
import { accessText, recentAccess } from '../lib/accessLog.js';
import { crewNameFor } from '../lib/provenance.js';

const SOURCE_SERVER = 'Onboard server (synthetic crew data + readings synced from crew devices) + simulated sensor days on this device';
const SOURCE_DEVICE = 'This device: bundled synthetic crew data + simulated sensor days + readings saved on this device (onboard server offline)';
const BASELINE_SERVER = 'Preflight baselines table (synthetic preflight average, crew.json)';
const BASELINE_DEVICE = 'Synthetic preflight average (crew.json, bundled)';
const KIND = { daily_vitals: 'Daily vitals', stand_test: 'Stand test' };

const stamp = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const isSeed = (r) => r?.payload?.origin === 'seed';
/** Seeded and simulated sensor rows never go through the outbox, so they get no sync badge. */
const hasSync = (r) => !isSeed(r) && !isSensorRecord(r);

/** Device-only copy of the seeded database, computed once from the bundled files. */
let deviceSeed = null;
function getDeviceSeed() {
  if (!deviceSeed) {
    const s = seedAll(crewFile, standFile);
    deviceSeed = { crew: s.crew, baselines: s.baselines, readings: s.readings.map(({ key, ...r }) => ({ id: key, ...r })) };
  }
  return deviceSeed;
}

function useCmoData() {
  const { version } = useOnboard();
  // Device only in the monorepo: the practice app's Supabase realtime feed is not ported, and the Java
  // backend has no readings endpoint yet. Built from bundled synthetic data + readings on this device.
  const online = false;
  const server = null;
  const live = false;
  const error = null;

  const demo = useDemo();
  const local = useMemo(() => [...readAllVitals(), ...readAllStandTests()], [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const fromServer = Boolean(online && server);
  const base = fromServer ? server : getDeviceSeed();
  const readings = useMemo(() => {
    // Saved readings dated after the demo's today stay hidden (not deleted) until the clock reaches them.
    const stored = onOrBefore(mergeReadings(base.readings, local), demo.today);
    // Simulated sensor days for every crew member, scored in the same timeline as their check-ins.
    const sensors = base.crew.flatMap((c) =>
      sensorRecords({
        crewId: c.id,
        crewDays: crewDaysOf(c.id),
        sensorDays: sensorDaysFor(c.id, demo.state, demo.today),
        saved: stored.filter((r) => r.crew_id === c.id && r.kind === 'daily_vitals' && !isSeed(r) && r.payload?.reading),
      }),
    );
    // A sensor day with a CMO exam merged in is already shown by the exam record itself (scored as
    // that same merged day), so it is not listed twice.
    const shownSensors = sensors.filter((r) => !r.payload?.exams?.some((x) => x.fields?.length));
    return [...stored, ...shownSensors];
  }, [base, local, demo.state, demo.today]);
  return { fromServer, live: fromServer && live, error, crew: base.crew, baselines: base.baselines, readings, today: demo.today };
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
      <ProvenanceChips chips={recordChips(row)} />
      {hasSync(row) && <SyncBadge record={row} />}
      {row.status !== 'normal' && row.reasons?.[0] && <p className="cmo-card__reason">{row.reasons[0]}</p>}
    </div>
  );
}

function CrewCard({ card, isSelf, onOpen, onRecordExam }) {
  const first = card.name.split(' ')[0];
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
      <details className="cmo-card__more">
        <summary className="cmo-card__sub">Preflight vs now</summary>
        <Comparison rows={card.comparison} />
      </details>
      <div className="cmo-card__actions">
        {onOpen && (
          <button type="button" className="btn btn--secondary cmo-card__open" onClick={() => onOpen(card.id)}>
            {isSelf ? 'Open my dashboard' : `Open ${first}’s dashboard`}
          </button>
        )}
        {onRecordExam && !isSelf && (
          <button type="button" className="btn btn--primary cmo-card__open" onClick={() => onRecordExam(card.id)} aria-label={`Record an exam for ${card.name}`}>
            Record an exam
          </button>
        )}
      </div>
    </li>
  );
}

function RecentAccess({ entries, names }) {
  const nameFor = (id) => names[id] ?? crewNameFor(id) ?? id;
  const list = recentAccess(entries, 10);
  return (
    <section className="card card--lg cmo__access" aria-labelledby="cmo-access-title">
      <h3 id="cmo-access-title" className="card__title">
        Recent access
      </h3>
      {list.length === 0 ? (
        <p className="muted">No one has opened another crew member’s dashboard yet.</p>
      ) : (
        <ol className="access-list">
          {list.map((e) => (
            <li key={e.id} className="access-list__item">
              <time dateTime={e.at}>{accessText(e, nameFor)}</time>
              {!e.synced && <span className="chip chip--muted">On device</span>}
            </li>
          ))}
        </ol>
      )}
      <SourceLabel source="Access log: this device, plus the onboard server when connected. Crew can see who viewed their data on their About page." />
    </section>
  );
}

export default function CrewMedicalOfficer({ selfId = null, onOpenCrew = null, onRecordExam = null, accessEntries = [], emergencies = [] }) {
  const { fromServer, live, error, crew, baselines, readings, today } = useCmoData();
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
          <p className="muted">
            Every crew member’s latest vitals and stand test, worst first. Statuses come from the same checks the crew see.
            {' '}Demo date <time dateTime={today}>{new Date(`${today}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time>.
          </p>
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
            Readings and preflight
          </h3>
          <ol className="cmo__cards">
            {cards.map((c) => (
              <CrewCard key={c.id} card={c} isSelf={c.id === selfId} onOpen={onOpenCrew} onRecordExam={onRecordExam} />
            ))}
          </ol>
          <SourceLabel source={`${fromServer ? SOURCE_SERVER : SOURCE_DEVICE} · Preflight: ${fromServer ? BASELINE_SERVER : BASELINE_DEVICE}`} simulated />
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
                    <ProvenanceChips chips={recordChips(r)} />
                    {hasSync(r) && <SyncBadge record={r} />}
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
          <SourceLabel source={fromServer ? SOURCE_SERVER : SOURCE_DEVICE} simulated />
        </section>
      </div>
      <section className="card card--lg cmo__access" aria-labelledby="cmo-emergencies-title">
        <h3 id="cmo-emergencies-title" className="card__title">
          Emergencies
        </h3>
        <EmergencyList list={emergencies} titleId="cmo-emergencies-title" empty="No emergencies recorded yet." />
        <SourceLabel source="Emergency records: this device, plus the onboard server when connected. Times use the real clock." />
      </section>
      <RecentAccess entries={accessEntries} names={names} />
    </div>
  );
}
