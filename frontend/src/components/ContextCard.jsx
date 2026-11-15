'use client';

import { ISOLATION_OPTIONS, WORKLOAD_OPTIONS, labelFor } from '../constants/checkin.js';
import { formatTime } from '../utils/format.js';

const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
const when = (iso) =>
  isToday(iso)
    ? `today at ${formatTime(iso)}`
    : new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The signed-in person's newest check-in on this device (context answers), or a prompt to log one. */
export default function ContextCard({ latestCheckin, onLogCheckin, buttonRef }) {
  return (
    <section className="card card--lg" aria-labelledby="context-title">
      <h2 id="context-title" className="card__title">Crew context</h2>

      {latestCheckin ? (
        <div className="context__body">
          <p className="context__score">
            Isolation <span className="num">{latestCheckin.isolation}</span> / 5
            <span className="muted"> · {labelFor(ISOLATION_OPTIONS, latestCheckin.isolation)}</span>
          </p>
          <p className="muted">
            Last check-in <time dateTime={latestCheckin.savedAt}>{when(latestCheckin.savedAt)}</time>
            {' · '}
            {latestCheckin.sleepHours} h sleep · {labelFor(WORKLOAD_OPTIONS, latestCheckin.workload)} workload
          </p>
        </div>
      ) : (
        <div className="context__body">
          <p>No check-in recorded yet.</p>
          <p className="muted">Isolation, sleep and workload help explain changes in stress and sleep readings.</p>
        </div>
      )}

      <button ref={buttonRef} type="button" className="btn btn--primary" onClick={onLogCheckin}>
        Log check-in
      </button>
    </section>
  );
}
