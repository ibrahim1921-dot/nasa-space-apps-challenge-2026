'use client';

// The newest wellness check-in on this device (teammate feature, f291403; wording from their ContextCard),
// or a prompt to log one. Sits next to "Crew context", which stays with the vitals check-in.

import { formatTime } from '../utils/format.js';
import { WellnessAnswers } from './WellnessCheckinForm.jsx';
import WellnessAttention from './WellnessAttention.jsx';
import { hasSymptoms, needsUrgentHelp } from '../lib/wellnessCheckin.js';

const when = (iso) =>
  new Date(iso).toDateString() === new Date().toDateString()
    ? `today at ${formatTime(iso)}`
    : new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** @param {{ latest: { answers, recorded_at }|null, onLog: (() => void)|null }} props  onLog is null when viewing someone else */
export default function WellnessCard({ latest, onLog }) {
  const answers = latest?.answers;
  return (
    <section className="card card--lg" aria-labelledby="wellness-title">
      <h2 id="wellness-title" className="card__title">Wellness check-in</h2>

      {answers ? (
        <div className="context__body">
          <p>
            {needsUrgentHelp(answers)
              ? 'Urgent symptoms reported. Contact the medical officer now.'
              : hasSymptoms(answers)
                ? 'Symptoms reported in your last check-in.'
                : 'No symptoms reported in your last check-in.'}
          </p>
          <p className="muted">
            Saved <time dateTime={latest.recorded_at}>{when(latest.recorded_at)}</time> on this device.
          </p>
          <WellnessAttention answers={answers} />
        </div>
      ) : (
        <div className="context__body">
          <p>No wellness check-in recorded yet.</p>
          <p className="muted">Share symptoms, sleep quality, mood, and how you are managing today.</p>
        </div>
      )}

      {onLog ? (
        <button type="button" className="btn btn--primary" onClick={onLog}>
          Log wellness check-in
        </button>
      ) : (
        <p className="muted">Wellness check-ins are logged by the crew member on their own device.</p>
      )}
      {answers && (
        <details className="wellness-review">
          <summary>Review your answers</summary>
          <WellnessAnswers answers={answers} />
        </details>
      )}
    </section>
  );
}
