'use client';

import { useState } from 'react';
import { FEATURES, SANE_RANGES, validateNight } from '../lib/nightlyScore.js';

const HOW_TO = {
  sleep_hr_median: "Middle value of your heart rate while asleep, from the watch's overnight report.",
  sleep_hr_p5: 'Your low-end sleeping heart rate (5th percentile), ignoring one-off dips. Must not exceed the line above.',
  total_sleep_h: 'Time actually asleep, not time in bed. 7 h 30 min = 7.5.',
  wake_pct: 'Share of the recording spent awake, from the sleep-stage summary.',
  n3_pct_of_sleep: 'Deep (N3) sleep as a share of total sleep.',
  rem_pct_of_sleep: 'REM sleep as a share of total sleep.',
};

const STEP = { sleep_hr_median: '1', sleep_hr_p5: '1', total_sleep_h: '0.1' };
const UNIT = { bpm: 'bpm', h: 'hours', '%': '%' };

const EMPTY = Object.fromEntries(FEATURES.map((f) => [f.key, '']));
const today = () => new Date().toISOString().slice(0, 10);

/** "Log tonight": the 6 features, validated here and again by the API. */
export default function LogNightForm({ subjectId, onSubmit, onDateChange }) {
  const [values, setValues] = useState(EMPTY);
  const [date, setDate] = useState(today);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const night = Object.fromEntries(
      FEATURES.map((f) => [f.key, values[f.key] === '' ? undefined : Number(values[f.key])]),
    );
    const problem = validateNight(night, 'night');
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ night, date });
      setValues(EMPTY);
    } catch (err) {
      setError(err.message || 'Could not score the night. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="lognight" onSubmit={handleSubmit} noValidate aria-labelledby="lognight-title">
      <h3 id="lognight-title" className="card__title">
        Log tonight
      </h3>
      <p className="muted lognight__intro">
        Scored against {subjectId}&apos;s own clean nights. Take the numbers from the wearable&apos;s overnight summary.
      </p>

      <div className="field lognight__date">
        <label htmlFor="night-date" className="field__label">
          Night of
        </label>
        <input
          id="night-date"
          type="date"
          className="input input--short"
          value={date}
          onChange={(e) => { setDate(e.target.value); if (e.target.value) onDateChange?.(e.target.value); }}
          required
        />
      </div>

      <div className="lognight__grid">
        {FEATURES.map((f) => {
          const [lo, hi] = SANE_RANGES[f.key];
          const hintId = `${f.key}-hint`;
          return (
            <div key={f.key} className="field lognight__field">
              <label htmlFor={`night-${f.key}`} className="field__label">
                {f.label} <span className="muted">({UNIT[f.unit]})</span>
              </label>
              <input
                id={`night-${f.key}`}
                name={f.key}
                type="number"
                inputMode="decimal"
                min={lo}
                max={hi}
                step={STEP[f.key] ?? '0.1'}
                className="input"
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                aria-describedby={hintId}
              />
              <p id={hintId} className="field__hint">
                {HOW_TO[f.key]}
              </p>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <div className="checkin__actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Scoring…' : 'Score this night'}
        </button>
      </div>
    </form>
  );
}
