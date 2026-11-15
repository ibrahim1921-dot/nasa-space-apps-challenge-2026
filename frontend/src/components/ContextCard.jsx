'use client';

import { ISOLATION_OPTIONS, WORKLOAD_OPTIONS, labelFor } from '../constants/checkin.js';
import { formatTime } from '../utils/format.js';
import { WellnessAnswers } from './CheckinForm.jsx';
import { hasSymptoms, needsUrgentHelp } from '../lib/wellnessCheckin.js';
import WellnessAttention from './WellnessAttention.jsx';

const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
const when = (iso) =>
  isToday(iso)
    ? `today at ${formatTime(iso)}`
    : new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The signed-in person's newest check-in on this device (context answers), or a prompt to log one. */
export default function ContextCard({ latestCheckin, onLogCheckin, buttonRef }) {
  return (
    <section className="card card--lg" aria-labelledby="context-title">
      <h2 id="context-title" className="card__title">Wellness check-in</h2>

      {latestCheckin?.wellness ? (
        <div className="context__body">
          <p>{needsUrgentHelp(latestCheckin.wellness) ? 'Urgent symptoms reported. Contact the medical officer now.' : hasSymptoms(latestCheckin.wellness) ? 'Symptoms reported in your last check-in.' : 'No symptoms reported in your last check-in.'}</p>
          <p className="muted">Saved <time dateTime={latestCheckin.savedAt}>{when(latestCheckin.savedAt)}</time> on this device.</p>
          <WellnessAttention answers={latestCheckin.wellness} />
        </div>
      ) : latestCheckin ? (
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
          <p className="muted">Share symptoms, sleep quality, mood, and how you are managing today.</p>
        </div>
      )}

      <button ref={buttonRef} type="button" className="btn btn--primary" onClick={onLogCheckin}>
        Log check-in
      </button>
      {latestCheckin?.wellness && <details className="wellness-review"><summary>Review your answers</summary><WellnessAnswers answers={latestCheckin.wellness} /></details>}
    </section>
  );
}
