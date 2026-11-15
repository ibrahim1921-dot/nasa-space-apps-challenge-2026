'use client';

import { ISOLATION_OPTIONS, WORKLOAD_OPTIONS, labelFor } from '../constants/checkin.js';
import { formatTime } from '../utils/format.js';

/**
 * The signed-in person's newest check-in on this device (context answers), or a prompt to log one.
 * `today` is the demo's today (YYYY-MM-DD); `sensorsToday` is true when simulated sensors recorded last night.
 */
export default function ContextCard({ latestCheckin, onLogCheckin, buttonRef, today = null, sensorsToday = false }) {
  const dayOf = (iso) => (today ? iso.slice(0, 10) : new Date(iso).toDateString());
  const todayKey = today ?? new Date().toDateString();
  const isToday = (iso) => dayOf(iso) === todayKey;
  const when = (iso) =>
    isToday(iso)
      ? `today at ${formatTime(iso)}`
      : new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const doneToday = Boolean(latestCheckin && isToday(latestCheckin.savedAt));
  const prompt = onLogCheckin && sensorsToday && !doneToday;

  return (
    <section className="card card--lg" aria-labelledby="context-title">
      <h2 id="context-title" className="card__title">Crew context</h2>
      {prompt && (
        <p className="context__prompt">
          Your sensors recorded last night. Confirm and add your mood (about 30 s).
          <span className="prov__sim">Simulated</span>
        </p>
      )}

      {latestCheckin ? (
        <div className="context__body">
          <p className="context__score">
            Isolation <span className="num">{latestCheckin.isolation}</span> / 5
            <span className="muted"> · {labelFor(ISOLATION_OPTIONS, latestCheckin.isolation)}</span>
          </p>
          <p className="muted">
            Last check-in <time dateTime={latestCheckin.savedAt}>{when(latestCheckin.savedAt)}</time>
            {' · '}
            {typeof latestCheckin.sleepHours === 'number' ? `${latestCheckin.sleepHours} h sleep · ` : ''}
            {labelFor(WORKLOAD_OPTIONS, latestCheckin.workload)} workload
          </p>
        </div>
      ) : (
        <div className="context__body">
          <p>No check-in recorded yet.</p>
          <p className="muted">Isolation, sleep and workload help explain changes in stress and sleep readings.</p>
        </div>
      )}

      {onLogCheckin ? (
        <button ref={buttonRef} type="button" className="btn btn--primary" onClick={onLogCheckin}>
          {prompt ? 'Confirm and add' : doneToday ? 'Check in again' : 'Log check-in'}
        </button>
      ) : (
        <p className="muted">Check-ins are logged by the crew member on their own device.</p>
      )}
    </section>
  );
}
