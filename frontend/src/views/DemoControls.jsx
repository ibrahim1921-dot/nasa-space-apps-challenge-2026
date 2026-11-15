'use client';

// Demo controls (More → Demo controls). Demo only: they move this browser's demo clock, add simulated
// sensor events, and can clear check-ins saved in this browser. They never touch the backend.

import { useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { crewRoster } from '../mocks/crew.js';
import { EVENT_TYPES, EVENT_TYPE_IDS, addDays } from '../lib/sensorFeed.js';
import { MISSION_END_DAY, eventStatus } from '../lib/demoState.js';
import { clearVitalsCheckins, readAllVitals } from '../lib/vitalsCheckinStore.js';
import SourceLabel from '../components/SourceLabel.jsx';
import { MISSION_PROFILES } from '../constants/mission.js';
import { useMission } from '../hooks/useMission.jsx';
import { contextLine } from '../lib/environmentRules.js';
import { REMINDER_SETTINGS, TEAM_SET } from '../content/reminderSchedule.js';

const longDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const names = Object.fromEntries(crewRoster.map((c) => [c.id, c.name]));
const STATUS_WORD = { upcoming: 'Starts', active: 'Active', ended: 'Ended' };

function ConfirmClear({ count, unsynced, onConfirm, onCancel, returnRef }) {
  const ref = useRef(null);
  useFocusTrap(ref, { onEscape: onCancel, getReturnTarget: () => returnRef.current });
  const plural = count === 1 ? 'check-in' : 'check-ins';
  return (
    <div className="drawer-root">
      <div className="drawer-backdrop" onClick={onCancel} />
      <div ref={ref} className="demo-dialog card" role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-desc">
        <h3 id="clear-title" className="card__title">
          Remove {count} {plural} saved on this device?
        </h3>
        <p id="clear-desc">
          This removes {count} daily {plural} from this browser only, for every crew member.
          This cannot be undone.
        </p>
        <div className="checkin__actions">
          <button type="button" className="btn btn--stop" onClick={onConfirm}>
            Remove {count} {plural}
          </button>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Missed items the ground console should list (3+ days in a row, team-set). Read only, from the same data
 * the ground adapter reads; the ground console itself shows them in pass 2.
 */
function GroundMissedList({ list }) {
  return (
    <section className="card card--lg demo-panel" aria-labelledby="demo-ground-title">
      <h3 id="demo-ground-title" className="card__title">
        Missed items for the ground
      </h3>
      <p className="muted demo-help">
        {REMINDER_SETTINGS.groundAfterDays} or more missed days in a row ({TEAM_SET}). Advance the day without checking in to see a
        missed check-in reach the CMO at {REMINDER_SETTINGS.cmoAfterDays} days and this list at {REMINDER_SETTINGS.groundAfterDays}.
      </p>
      {list.length === 0 ? (
        <p className="muted">Nothing for the ground today.</p>
      ) : (
        <ul className="demo-ground__list" aria-label="Missed items for the ground">
          {list.map((m) => (
            <li key={`${m.crewId}-${m.reminderId}`}>
              <strong>{names[m.crewId] ?? m.crewId}</strong> · {m.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function DemoControls({ demo, groundList = [] }) {
  const { version } = useOnboard();
  // For judges: the mission environment can always be changed here (the header chip is CMO only).
  const mission = useMission();
  const [crewId, setCrewId] = useState(crewRoster[1]?.id ?? crewRoster[0].id);
  const [type, setType] = useState('fever');
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState(null);
  const clearRef = useRef(null);

  void version; // re-render when saved records change, so the count stays right
  const saved = readAllVitals();
  const unsynced = saved.filter((r) => !r.synced_at).length;
  const tomorrow = addDays(demo.today, 1);
  const limitText =
    demo.limit.reason === 'mission'
      ? `Mission complete: mission day ${MISSION_END_DAY} reached.`
      : `Demo clock is up to date (today, ${longDate(demo.limit.date)}).`;

  function clear() {
    const { removed, ok } = clearVitalsCheckins();
    setConfirming(false);
    setMessage(ok ? `Removed ${removed} check-in${removed === 1 ? '' : 's'} from this device.` : 'This browser would not clear its storage.');
    clearRef.current?.focus();
  }

  return (
    <div className="demo">
      <section className="card card--lg demo-panel" aria-labelledby="demo-title">
        <p className="demo-banner" role="note">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M8 1.5 15 14H1L8 1.5Z M8 6v3.5 M8 11.5v.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <strong>Demo only.</strong> Not a crew feature. These controls change this browser’s demo clock and simulated sensors.
        </p>
        <h2 id="demo-title" className="view-title">
          Demo controls
        </h2>

        <dl className="demo-clock">
          <div>
            <dt>Demo date</dt>
            <dd>
              <time dateTime={demo.today}>{longDate(demo.today)}</time>
            </dd>
          </div>
          <div>
            <dt>Mission day</dt>
            <dd className="num">
              {demo.missionDay} of {MISSION_END_DAY}
            </dd>
          </div>
          <div>
            <dt>Simulated sensor days</dt>
            <dd className="num">{demo.offset}</dd>
          </div>
        </dl>

        <div className="demo-actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={demo.advance} disabled={!demo.canAdvance}>
            Advance one day
          </button>
          <button type="button" className="btn btn--secondary btn--lg" onClick={demo.reset}>
            Back to the start
          </button>
        </div>
        {!demo.canAdvance && (
          <p className="demo-limit" role="status">
            {limitText}
          </p>
        )}
        <p className="muted demo-help">
          “Advance one day” moves the clock for the whole crew. “Back to the start” resets the demo clock and events only;
          saved check-ins are kept. Check-ins dated after the demo date are hidden until the clock reaches them.
        </p>
      </section>

      <GroundMissedList list={groundList} />

      <section className="card card--lg demo-panel" aria-labelledby="demo-env-title">
        <h3 id="demo-env-title" className="card__title">
          Mission environment
        </h3>
        <div className="demo-form">
          <div className="field">
            <label htmlFor="demo-env" className="field__label">
              Where the crew are
            </label>
            <select id="demo-env" className="input demo-select" value={mission.profileId} onChange={(e) => mission.setProfile(e.target.value)} aria-describedby="demo-env-hint">
              {MISSION_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <p id="demo-env-hint" className="field__hint">
              {contextLine(mission.profile)}. In the app only the Crew Medical Officer changes this, from the header chip.
            </p>
          </div>
        </div>
      </section>

      <section className="card card--lg demo-panel" aria-labelledby="demo-event-title">
        <h3 id="demo-event-title" className="card__title">
          Simulate an event
        </h3>
        <form
          className="demo-form"
          onSubmit={(e) => {
            e.preventDefault();
            demo.addEvent({ crewId, type });
            setMessage(`${EVENT_TYPES[type].label} for ${names[crewId]} starts ${shortDate(tomorrow)}.`);
          }}
        >
          <div className="field">
            <label htmlFor="demo-crew" className="field__label">
              Crew member
            </label>
            <select id="demo-crew" className="input demo-select" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
              {crewRoster.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="demo-type" className="field__label">
              Event
            </label>
            <select id="demo-type" className="input demo-select" value={type} onChange={(e) => setType(e.target.value)}>
              {EVENT_TYPE_IDS.map((id) => (
                <option key={id} value={id}>
                  {EVENT_TYPES[id].label} ({EVENT_TYPES[id].days} days)
                </option>
              ))}
            </select>
            <p className="field__hint">{EVENT_TYPES[type].description}.</p>
          </div>
          <button type="submit" className="btn btn--primary btn--lg">
            Starts tomorrow ({shortDate(tomorrow)})
          </button>
        </form>

        <h4 className="demo-sub">Events</h4>
        {demo.state.events.length === 0 ? (
          <p className="muted">No simulated events.</p>
        ) : (
          <ul className="demo-events">
            {demo.state.events.map((e, i) => {
              const st = eventStatus(e, demo.offset, demo.lastDate);
              return (
                <li key={`${e.crewId}-${e.type}-${e.startOffset}`} className={`demo-event demo-event--${st.status}`}>
                  <span>
                    <strong>{names[e.crewId] ?? e.crewId}</strong> · {EVENT_TYPES[e.type].label}
                    <span className="muted">
                      {' '}
                      · {shortDate(st.from)}–{shortDate(st.to)}
                    </span>
                  </span>
                  <span className="chip chip--muted">{STATUS_WORD[st.status]}</span>
                  <button type="button" className="btn btn--secondary demo-event__remove" onClick={() => demo.removeEvent(i)}>
                    Remove<span className="sr-only"> {EVENT_TYPES[e.type].label} for {names[e.crewId]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card card--lg demo-panel" aria-labelledby="demo-clear-title">
        <h3 id="demo-clear-title" className="card__title">
          Check-ins on this device
        </h3>
        <p>
          <span className="num">{saved.length}</span> daily check-in{saved.length === 1 ? '' : 's'} saved in this browser
          {''}.
        </p>
        <button
          ref={clearRef}
          type="button"
          className="btn btn--secondary btn--lg"
          disabled={saved.length === 0}
          onClick={() => setConfirming(true)}
        >
          Clear check-ins saved on this device
        </button>
        <p className="muted demo-help">
          Only this browser’s copies are removed. Nothing on the backend is changed.
        </p>
        {message && (
          <p className="demo-message" role="status">
            {message}
          </p>
        )}
        <SourceLabel source="Demo state saved in this browser (localStorage)" simulated />
      </section>

      {confirming && (
        <ConfirmClear count={saved.length} unsynced={unsynced} onConfirm={clear} onCancel={() => setConfirming(false)} returnRef={clearRef} />
      )}
    </div>
  );
}
