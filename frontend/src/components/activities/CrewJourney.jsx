'use client';

import { useEffect, useRef, useState } from 'react';
import { ACTIVITY_SETTINGS, EXERCISE_TYPES, LOGGED_NOT_SCORED } from '../../content/activities.js';
import { GATE_TEXT, validateJourney } from '../../lib/activities.js';
import RouteLine from './RouteLine.jsx';
import LeaveConfirm, { useEscape } from './LeaveConfirm.jsx';

const J = ACTIVITY_SETTINGS.journey;

/**
 * Crew Journey: log one exercise session (type and 5–120 minutes). The whole crew's minutes move one ship.
 * This person's own contribution is shown only to them.
 * @param {{ onSave, onExit, progress, mine: number, gate: 'open'|'rest'|'done' }} props
 */
export default function CrewJourney({ onSave, onExit, progress, mine, gate }) {
  const [type, setType] = useState('');
  const [text, setText] = useState('');
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const headingRef = useRef(null);
  useEffect(() => headingRef.current?.focus(), []);

  const dirty = type !== '' || text !== '';
  function askLeave() {
    if (!dirty) return onExit();
    setConfirming(true);
  }
  useEscape(askLeave, !confirming);

  function submit(e) {
    e.preventDefault();
    if (gate !== 'open') return;
    const minutes = text.trim() === '' ? '' : Number(text.trim());
    const problem = validateJourney({ type, minutes });
    if (problem) {
      setErrors(type ? { minutes: problem } : { type: problem });
      setDone(null);
      return;
    }
    const res = onSave({ type, minutes });
    if (!res.ok) return setErrors({ minutes: res.error });
    setErrors({});
    setType('');
    setText('');
    setDone(`Saved: ${minutes} min on the ${EXERCISE_TYPES.find((t) => t.value === type).label.toLowerCase()}. The crew ship moved on.`);
  }

  return (
    <div className="act-journey">
      <section className="card card--lg act-screen" aria-labelledby="cj-title">
        <div className="act-screen__head">
          <h2 id="cj-title" ref={headingRef} tabIndex={-1} className="view-title">
            Crew Journey
          </h2>
          <button type="button" className="link-btn act-leave" onClick={askLeave}>
            Back
          </button>
        </div>
        <p>Log an exercise session. Every crew member’s minutes move the same ship.</p>
        {gate !== 'open' ? (
          <p className="act-gate" role="status">
            {GATE_TEXT[gate]}
          </p>
        ) : (
          <form onSubmit={submit} noValidate className="cj-form">
            <fieldset className="field">
              <legend className="field__label">Type</legend>
              <div className="segmented act-segmented">
                {EXERCISE_TYPES.map((t) => (
                  <label key={t.value} className="segmented__option">
                    <input
                      type="radio"
                      name="cj-type"
                      value={t.value}
                      className="visually-hidden-input"
                      checked={type === t.value}
                      onChange={() => setType(t.value)}
                      aria-invalid={errors.type ? 'true' : undefined}
                    />
                    <span className="segmented__face">{t.label}</span>
                  </label>
                ))}
              </div>
              {errors.type && (
                <p className="field__error" role="alert">
                  {errors.type}
                </p>
              )}
            </fieldset>
            <div className="field">
              <label htmlFor="cj-minutes" className="field__label">
                Minutes ({J.minMinutes}–{J.maxMinutes})
              </label>
              <div className="cj-row">
                <input
                  id="cj-minutes"
                  className="input input--short"
                  inputMode="numeric"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  aria-invalid={errors.minutes ? 'true' : undefined}
                  aria-describedby={errors.minutes ? 'cj-minutes-error' : undefined}
                  autoComplete="off"
                />
                <button type="submit" className="btn act-btn">
                  Log session
                </button>
              </div>
              {errors.minutes && (
                <p id="cj-minutes-error" className="field__error" role="alert">
                  {errors.minutes}
                </p>
              )}
            </div>
          </form>
        )}
        {done && (
          <p className="act-done" role="status">
            {done}
          </p>
        )}
        <p className="act-tag">{LOGGED_NOT_SCORED}</p>
      </section>
      <RouteLine progress={progress} mine={mine} />
      {confirming && <LeaveConfirm onLeave={onExit} onStay={() => setConfirming(false)} />}
    </div>
  );
}
