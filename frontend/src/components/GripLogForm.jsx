'use client';

import { useState } from 'react';
import { GRIP_LOG_LABEL, GRIP_MAX_KG, GRIP_MIN_KG, parseKg, validateGrip } from '../lib/gripLog.js';

const stamp = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Vitals → Grip strength: log one value for the weekly grip reminder. Saved on this device only and not
 * scored: the grip status above still comes from the crew record (lib/fitness.js).
 * @param {{ entries: object[], onLog: (kg: number) => { ok: boolean, error?: string } }} props
 */
export default function GripLogForm({ entries = [], onLog }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  function submit(e) {
    e.preventDefault();
    const kg = parseKg(text);
    const problem = validateGrip(kg);
    if (problem) {
      setError(problem);
      setDone(null);
      return;
    }
    const res = onLog(kg);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setText('');
    setDone(`Saved ${kg} kg.`);
  }

  return (
    <section className="card grip-log" aria-labelledby="grip-log-title">
      <h3 id="grip-log-title" className="card__title">
        Log grip strength
      </h3>
      <p className="muted grip-log__note">Enter the value from this week’s grip test.</p>
      <form className="grip-log__form" onSubmit={submit} noValidate>
        <label htmlFor="grip-kg" className="grip-log__label">
          Grip strength (kg, {GRIP_MIN_KG}–{GRIP_MAX_KG}, whole or half kg)
        </label>
        <div className="grip-log__row">
          <input
            id="grip-kg"
            className="input input--short"
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'grip-kg-error' : undefined}
            autoComplete="off"
          />
          <button type="submit" className="btn btn--primary">
            Save
          </button>
        </div>
        {error && (
          <p id="grip-kg-error" className="field__error" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="grip-log__done" role="status">
            {done}
          </p>
        )}
      </form>
      {entries.length > 0 && (
        <ul className="grip-log__list" aria-label="Logged grip values">
          {entries.slice(0, 5).map((e) => (
            <li key={e.id}>
              <span className="num">{e.kg} kg</span> · {stamp(e.recorded_at)}{' '}
              <span className="muted">· {GRIP_LOG_LABEL}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted grip-log__note">{GRIP_LOG_LABEL}: the status above comes from the crew record.</p>
    </section>
  );
}
