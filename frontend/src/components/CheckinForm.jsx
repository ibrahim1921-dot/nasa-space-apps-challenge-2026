'use client';

import { useEffect, useRef, useState } from 'react';
import { submitContextCheckin } from '../services/healthService.js';
import { scoreCheckinOnDevice } from '../lib/deviceScoring.js';
import {
  FAMILY_CALL_OPTIONS,
  ISOLATION_OPTIONS,
  TENSION_OPTIONS,
  WORKLOAD_OPTIONS,
} from '../constants/checkin.js';
import { MOOD_OPTIONS, VITALS_SCREENS } from '../constants/vitals.js';
import { getProfile } from '../constants/mission.js';
import { READING_FIELDS, READING_KEYS } from '../lib/vitalsCheckin.js';
import { makeVitalsRecord, writeVitalsCheckin } from '../lib/vitalsCheckinStore.js';
import CheckinResult from './CheckinResult.jsx';

const INITIAL = {
  systolic: '',
  diastolic: '',
  heart_rate: '',
  glucose: '',
  temperature: '',
  sleep_hours: '',
  mood: '',
  isolation: '',
  workload: '',
  familyCall: '',
  tension: '',
  notes: '',
};
const CONTEXT_ORDER = ['isolation', 'sleep_hours', 'workload', 'familyCall', 'tension'];
const TOTAL_STEPS = VITALS_SCREENS.length + 1; // vitals screens + the context questions

/** One vitals value: a plain message for the person, or null when it is plausible. */
function checkVital(key, text) {
  const { min, max, unit, label, integer } = READING_FIELDS[key];
  if (text === '') return `Enter your ${label}.`;
  const n = Number(text);
  if (!Number.isFinite(n)) return `Enter your ${label} as a number.`;
  if (integer && !Number.isInteger(n)) return `Choose a whole number from ${min} to ${max}.`;
  if (n < min || n > max) return `That looks off. Enter a value from ${min} to ${max} ${unit}.`;
  return null;
}

function validateScreen(screen, values) {
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

function validateContext(values) {
  const errors = {};
  if (!values.isolation) errors.isolation = 'Choose how isolated you feel.';
  const sleep = checkVital('sleep_hours', values.sleep_hours);
  if (sleep) errors.sleep_hours = sleep;
  if (!values.workload) errors.workload = 'Choose your workload.';
  if (!values.familyCall) errors.familyCall = 'Choose when you last called family.';
  if (!values.tension) errors.tension = 'Choose yes or no.';
  return errors;
}

/** Radio group styled as segmented buttons. Native radios give Tab + arrow-key behaviour for free. */
function SegmentedField({ legend, name, options, value, onChange, error, large = false, children }) {
  const errorId = `${name}-error`;
  return (
    <fieldset className="field">
      <legend className="field__label">{legend}</legend>
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

function NumberField({ field, value, onChange, error, hint }) {
  const id = `vital-${field.key}`;
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

function HowTo({ howTo }) {
  return (
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
  );
}

function Progress({ step }) {
  const pct = Math.round(((step + 1) / TOTAL_STEPS) * 100);
  const name = step < VITALS_SCREENS.length ? VITALS_SCREENS[step].title : 'Context';
  return (
    <div className="vprogress">
      <p className="vprogress__text">
        Step <span className="num">{step + 1}</span> of <span className="num">{TOTAL_STEPS}</span> · {name}
      </p>
      <div
        className="vprogress__bar"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={step + 1}
        aria-label="Check-in progress"
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Daily check-in: vitals (one indicator per screen), then the isolation and confinement questions,
 * then the scored result. Saves the result on this device.
 */
export default function CheckinForm({ missionDay, crewId, crewName, profileId, onSaved, onCancel }) {
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(0); // 0..5 vitals screens, 6 context
  const [phase, setPhase] = useState('form'); // 'form' | 'saving' | 'result'
  const [submitError, setSubmitError] = useState(null);
  const [outcome, setOutcome] = useState(null); // { record, stored }
  const headingRef = useRef(null);
  const formRef = useRef(null);
  const firstRender = useRef(true);
  const profile = getProfile(profileId);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      headingRef.current?.focus();
      return;
    }
    // Move focus to the new screen's first input so keyboard and screen-reader users land on it.
    formRef.current?.querySelector('input, textarea')?.focus();
  }, [step]);

  const setField = (name) => (value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const onVitals = step < VITALS_SCREENS.length;
  const screen = onVitals ? VITALS_SCREENS[step] : null;

  function focusFirstError(found, order) {
    const first = order.find((k) => found[k]);
    if (first) formRef.current?.querySelector(`[name="${first}"]`)?.focus();
    return Boolean(first);
  }

  function next(event) {
    event.preventDefault();
    const found = validateScreen(screen, values);
    setErrors(found);
    if (focusFirstError(found, screen.fields.map((f) => f.key))) return;
    setStep((s) => s + 1);
  }

  function back() {
    setErrors({});
    setSubmitError(null);
    if (step === 0) onCancel();
    else setStep((s) => s - 1);
  }

  async function submit(event) {
    event.preventDefault();
    const found = validateContext(values);
    setErrors(found);
    if (focusFirstError(found, CONTEXT_ORDER)) return;

    const reading = Object.fromEntries(READING_KEYS.map((k) => [k, Number(values[k])]));
    const context = {
      missionDay: missionDay ?? null,
      isolation: Number(values.isolation),
      sleepHours: reading.sleep_hours,
      workload: values.workload,
      lastFamilyCall: values.familyCall,
      crewTension: values.tension === 'yes',
      notes: values.notes.trim(),
    };

    setPhase('saving');
    setSubmitError(null);
    try {
      // Offline-first: scored here with the same engine the onboard server uses, saved on this
      // device, then copied to the onboard server by the outbox when it is reachable.
      const result = scoreCheckinOnDevice({ crewId, reading });
      const record = makeVitalsRecord({ crewId, reading, context, result, recordedAt: result.evaluated_at });
      const stored = writeVitalsCheckin(record);
      // The context endpoint only acknowledges today; it must not block saving when offline.
      submitContextCheckin(context).catch(() => {});
      setOutcome({ record, stored });
      setPhase('result');
      window.scrollTo(0, 0);
    } catch (err) {
      setSubmitError(`Could not check your readings: ${err.message}. Your answers are still here; please try again.`);
      setPhase('form');
    }
  }

  function done() {
    const { record } = outcome;
    onSaved({ ...record.payload.context, savedAt: record.recorded_at, vitals: record });
  }

  return (
    <section className="card card--lg checkin" aria-labelledby="checkin-title">
      {phase === 'result' && outcome ? (
        <CheckinResult
          record={outcome.record}
          result={outcome.record.payload.result}
          profile={profile}
          stored={outcome.stored}
          crewName={crewName}
          onDone={done}
        />
      ) : (
        <>
          <h2 id="checkin-title" className="checkin__title" ref={headingRef} tabIndex={-1}>
            Daily check-in
          </h2>
          <p className="muted checkin__intro">
            Vitals, then isolation and confinement factors{missionDay ? ` · Mission day ${missionDay}` : ''}
          </p>
          <Progress step={step} />

          {onVitals ? (
            <form ref={formRef} onSubmit={next} noValidate key={screen.id}>
              <h3 className="vstep__title">{screen.title}</h3>
              <HowTo howTo={screen.howTo} />
              {screen.fields.map((f) =>
                f.kind === 'scale' ? (
                  <SegmentedField
                    key={f.key}
                    legend={f.label}
                    name={f.key}
                    options={MOOD_OPTIONS}
                    value={values[f.key]}
                    onChange={setField(f.key)}
                    error={errors[f.key]}
                    large
                  >
                    <div className="segmented__ends" aria-hidden="true">
                      <span>Very low</span>
                      <span>Very good</span>
                    </div>
                  </SegmentedField>
                ) : (
                  <NumberField
                    key={f.key}
                    field={f}
                    value={values[f.key]}
                    onChange={setField(f.key)}
                    error={errors[f.key]}
                  />
                ),
              )}
              <div className="checkin__actions">
                <button type="submit" className="btn btn--primary btn--lg">
                  Next
                </button>
                <button type="button" className="btn btn--secondary btn--lg" onClick={back}>
                  {step === 0 ? 'Cancel' : 'Back'}
                </button>
              </div>
            </form>
          ) : (
            <form ref={formRef} onSubmit={submit} noValidate>
              <h3 className="vstep__title">Context</h3>
              <SegmentedField
                legend="How isolated do you feel today?"
                name="isolation"
                options={ISOLATION_OPTIONS}
                value={values.isolation}
                onChange={setField('isolation')}
                error={errors.isolation}
                large
              >
                <div className="segmented__ends" aria-hidden="true">
                  <span>Not at all</span>
                  <span>Very isolated</span>
                </div>
              </SegmentedField>

              <NumberField
                field={VITALS_SCREENS.find((s) => s.id === 'sleep_hours').fields[0]}
                value={values.sleep_hours}
                onChange={setField('sleep_hours')}
                error={errors.sleep_hours}
                hint="Filled in from your vitals. Change it here if it was wrong."
              />

              <SegmentedField
                legend="Workload today"
                name="workload"
                options={WORKLOAD_OPTIONS}
                value={values.workload}
                onChange={setField('workload')}
                error={errors.workload}
                large
              />

              <SegmentedField
                legend="Last call with family"
                name="familyCall"
                options={FAMILY_CALL_OPTIONS}
                value={values.familyCall}
                onChange={setField('familyCall')}
                error={errors.familyCall}
                large
              />

              <SegmentedField
                legend="Tension with crewmates?"
                name="tension"
                options={TENSION_OPTIONS}
                value={values.tension}
                onChange={setField('tension')}
                error={errors.tension}
                large
              />

              <div className="field">
                <label htmlFor="notes" className="field__label">
                  Notes <span className="muted">(optional)</span>
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  maxLength={500}
                  className="input"
                  value={values.notes}
                  onChange={(e) => setField('notes')(e.target.value)}
                />
              </div>

              {submitError && (
                <p className="field__error" role="alert">
                  {submitError}
                </p>
              )}

              <div className="checkin__actions">
                <button type="submit" className="btn btn--primary btn--lg" disabled={phase === 'saving'}>
                  {phase === 'saving' ? 'Checking…' : 'Save and see results'}
                </button>
                <button type="button" className="btn btn--secondary btn--lg" onClick={back} disabled={phase === 'saving'}>
                  Back
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
