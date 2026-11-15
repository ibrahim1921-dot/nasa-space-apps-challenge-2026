'use client';

// Inputs shared by the check-in screens: number fields, segmented radio groups, the how-to block,
// and the plain-language checks behind them.

import { READING_FIELDS } from '../lib/vitalsCheckin.js';
import { WhyLine } from './WhyItMatters.jsx';
import { useMission } from '../hooks/useMission.jsx';
import { HOWTO_SCREENS } from '../lib/environmentRules.js';

/** One vitals value: a plain message for the person, or null when it is plausible. */
export function checkVital(key, text) {
  const { min, max, unit, label, integer } = READING_FIELDS[key];
  if (text === '') return `Enter your ${label}.`;
  const n = Number(text);
  if (!Number.isFinite(n)) return `Enter your ${label} as a number.`;
  if (integer && !Number.isInteger(n)) return `Choose a whole number from ${min} to ${max}.`;
  if (n < min || n > max) return `That looks off. Enter a value from ${min} to ${max} ${unit}.`;
  return null;
}

export function validateScreen(screen, values) {
  const errors = {};
  for (const f of screen.fields) {
    const e = checkVital(f.key, values[f.key]);
    if (e) errors[f.key] = e;
  }
  if (screen.id === 'blood_pressure' && !errors.systolic && !errors.diastolic) {
    if (Number(values.diastolic) >= Number(values.systolic)) {
      errors.diastolic = 'The bottom number should be lower than the top number. Check the order.';
    }
  }
  return errors;
}

/** Radio group styled as segmented buttons. Native radios give Tab + arrow-key behaviour for free. */
export function SegmentedField({ legend, name, options, value, onChange, error, large = false, tag = null, children }) {
  const errorId = `${name}-error`;
  return (
    <fieldset className="field">
      <legend className="field__label">
        {legend}
        {tag && <span className="field__tag">{tag}</span>}
      </legend>
      <div className={`segmented${large ? ' segmented--lg' : ''}`}>
        {options.map((o) => (
          <label key={o.value} className="segmented__option">
            <input
              type="radio"
              className="visually-hidden-input"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            <span className="segmented__face">
              {o.label}
              {o.srLabel && <span className="sr-only">, {o.srLabel}</span>}
            </span>
          </label>
        ))}
      </div>
      {children}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function NumberField({ field, value, onChange, error, hint, idPrefix = 'vital' }) {
  const id = `${idPrefix}-${field.key}`;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  const { min, max } = READING_FIELDS[field.key];
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {field.label}
      </label>
      <div className="vinput">
        <input
          id={id}
          name={field.key}
          type="number"
          inputMode={field.inputMode}
          min={min}
          max={max}
          step={field.step}
          className="input vinput__input num"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <span className="vinput__unit">{field.unit}</span>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

/** `screenId`: blood pressure, heart rate and temperature also get the mission environment line. */
export function HowTo({ howTo, whyId = null, screenId = whyId }) {
  const { rules } = useMission();
  const envLine = HOWTO_SCREENS.includes(screenId) ? rules.howTo : null;
  return (
    <>
    {envLine && <p className="howto__env">{envLine}</p>}
    <dl className="howto">
      <div className="howto__item">
        <dt>How</dt>
        <dd>{howTo.posture}</dd>
      </div>
      <div className="howto__item">
        <dt>When</dt>
        <dd>{howTo.timing}</dd>
      </div>
      <div className="howto__item">
        <dt>Can skew it</dt>
        <dd>{howTo.skew}</dd>
      </div>
    </dl>
    {whyId && <WhyLine id={whyId} className="howto__why" />}
    </>
  );
}
