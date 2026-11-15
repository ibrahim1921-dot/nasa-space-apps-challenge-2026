'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { READING_KEYS } from '../lib/vitalsCheckin.js';
import { makeVitalsRecord, writeVitalsCheckin } from '../lib/vitalsCheckinStore.js';
import CheckinResult from './CheckinResult.jsx';
import SensorConfirm, { deviceOfScreen, sensorText } from './SensorConfirm.jsx';
import { HowTo, NumberField, SegmentedField, checkVital, validateScreen } from './CheckinFields.jsx';

const EMPTY = {
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
const SENSOR_CONTEXT_ORDER = ['mood', 'isolation', 'workload', 'familyCall', 'tension'];
const TOTAL_STEPS = VITALS_SCREENS.length + 1; // vitals screens + the context questions
/** The readings worn sensors record: every vitals screen except mood. */
const SENSOR_SCREENS = VITALS_SCREENS.filter((s) => s.id !== 'mood');
const MOOD_SCREEN = VITALS_SCREENS.find((s) => s.id === 'mood');
const FROM_LAST = 'From your last check-in';

/** Workload, family call and tension from the person's last check-in, as form values. */
function carriedOver(last) {
  if (!last) return {};
  const out = {};
  if (WORKLOAD_OPTIONS.some((o) => o.value === last.workload)) out.workload = last.workload;
  if (FAMILY_CALL_OPTIONS.some((o) => o.value === last.lastFamilyCall)) out.familyCall = last.lastFamilyCall;
  if (typeof last.crewTension === 'boolean') out.tension = last.crewTension ? 'yes' : 'no';
  return out;
}

function validateContext(values, { withSleep = true, withMood = false } = {}) {
  const errors = {};
  if (withMood && !values.mood) errors.mood = 'Choose your mood.';
  if (!values.isolation) errors.isolation = 'Choose how isolated you feel.';
  if (withSleep) {
    const sleep = checkVital('sleep_hours', values.sleep_hours);
    if (sleep) errors.sleep_hours = sleep;
  }
  if (!values.workload) errors.workload = 'Choose your workload.';
  if (!values.familyCall) errors.familyCall = 'Choose when you last called family.';
  if (!values.tension) errors.tension = 'Choose yes or no.';
  return errors;
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

/** Workload, family call and tension; values copied from the last check-in are labelled and change in one tap. */
function CarriedQuestions({ values, errors, setField, carried }) {
  const tag = (name) => (carried[name] !== undefined && values[name] === carried[name] ? FROM_LAST : null);
  return (
    <>
      <SegmentedField
        legend="Workload today"
        name="workload"
        options={WORKLOAD_OPTIONS}
        value={values.workload}
        onChange={setField('workload')}
        error={errors.workload}
        tag={tag('workload')}
        large
      />
      <SegmentedField
        legend="Last call with family"
        name="familyCall"
        options={FAMILY_CALL_OPTIONS}
        value={values.familyCall}
        onChange={setField('familyCall')}
        error={errors.familyCall}
        tag={tag('familyCall')}
        large
      />
      <SegmentedField
        legend="Tension with crewmates?"
        name="tension"
        options={TENSION_OPTIONS}
        value={values.tension}
        onChange={setField('tension')}
        error={errors.tension}
        tag={tag('tension')}
        large
      />
    </>
  );
}

function IsolationField({ values, errors, setField }) {
  return (
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
  );
}

function NotesField({ values, setField }) {
  return (
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
  );
}

/** Initial row state: sensor rows wait for confirmation; a gap asks for the value by hand. */
const initialRows = (sensorDay) =>
  Object.fromEntries(
    SENSOR_SCREENS.map((s) => [s.id, sensorDay && sensorDay.devices?.[deviceOfScreen(s)] === 'ok' ? 'sensor' : 'manual']),
  );

/** The sensor values as form text. */
const sensorValues = (sensorDay) =>
  Object.fromEntries(SENSOR_SCREENS.flatMap((s) => s.fields.map((f) => [f.key, sensorText(sensorDay, f.key) ?? ''])));

/** The demo date with the current time of day, so a check-in lands on the demo's "today". */
const stampFor = (today) => (today ? `${today}T${new Date().toISOString().slice(11)}` : new Date().toISOString());

/**
 * Daily check-in.
 * - With sensors (the default when today has a simulated sensor day): screen 1 "Overnight from your
 *   sensors" (confirm or re-measure each reading), screen 2 mood and the isolation/context questions.
 * - "Enter everything by hand": the full manual flow, one indicator per screen, then the context questions.
 * Both save the same record shape, scored on this device and queued for the onboard server.
 */
export default function CheckinForm({
  missionDay,
  crewId,
  crewName,
  profileId,
  onSaved,
  onCancel,
  today = null,
  sensorDay = null,
  sensorDays = [],
  lastContext = null,
  enteredBy = null,
  demoEvents = [],
}) {
  const carried = useMemo(() => carriedOver(lastContext), [lastContext]);
  const [mode, setMode] = useState(sensorDay ? 'sensors' : 'manual'); // 'sensors' | 'manual'
  const [values, setValues] = useState(() => ({ ...EMPTY, ...carried, ...(sensorDay ? sensorValues(sensorDay) : {}) }));
  const [rowState, setRowState] = useState(() => initialRows(sensorDay));
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(0); // manual: 0..5 vitals screens, 6 context · sensors: 0 confirm, 1 context
  const [phase, setPhase] = useState('form'); // 'form' | 'saving' | 'result'
  const [submitError, setSubmitError] = useState(null);
  const [outcome, setOutcome] = useState(null); // { record, stored }
  const headingRef = useRef(null);
  const stageRef = useRef(null);
  const formRef = useRef(null);
  const firstRender = useRef(true);
  const profile = getProfile(profileId);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      headingRef.current?.focus();
      return;
    }
    if (mode === 'sensors') stageRef.current?.focus();
    // Move focus to the new screen's first input so keyboard and screen-reader users land on it.
    else formRef.current?.querySelector('input, textarea')?.focus();
  }, [step, mode]);

  const setField = (name) => (value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  };

  // Preview status per row from the sensor values alone (the same engine as the saved result).
  const preview = useMemo(() => {
    if (!sensorDay) return null;
    const reading = Object.fromEntries(READING_KEYS.map((k) => [k, null]));
    for (const s of SENSOR_SCREENS) for (const f of s.fields) {
      const t = sensorText(sensorDay, f.key);
      reading[f.key] = t === null ? null : Number(t);
    }
    try {
      const result = scoreCheckinOnDevice({ crewId, reading, at: stampFor(today), sensorDays });
      return Object.fromEntries(Object.entries(result.indicators).map(([id, r]) => [id, r.status]));
    } catch {
      return null;
    }
  }, [crewId, sensorDay, sensorDays, today]);

  const rowActions = {
    confirm: (id) => setRowState((s) => ({ ...s, [id]: s[id] === 'confirmed' ? 'sensor' : 'confirmed' })),
    manual: (id) => {
      const screen = SENSOR_SCREENS.find((s) => s.id === id);
      setRowState((s) => ({ ...s, [id]: 'manual' }));
      setValues((v) => ({ ...v, ...Object.fromEntries(screen.fields.map((f) => [f.key, ''])) }));
      // Land on the new input once it renders.
      setTimeout(() => document.getElementById(`sensor-${screen.fields[0].key}`)?.focus(), 0);
    },
    useSensor: (id) => {
      const screen = SENSOR_SCREENS.find((s) => s.id === id);
      setRowState((s) => ({ ...s, [id]: 'sensor' }));
      setValues((v) => ({ ...v, ...Object.fromEntries(screen.fields.map((f) => [f.key, sensorText(sensorDay, f.key) ?? ''])) }));
      setErrors((e) => ({ ...e, ...Object.fromEntries(screen.fields.map((f) => [f.key, undefined])) }));
    },
    skip: (id) => {
      const screen = SENSOR_SCREENS.find((s) => s.id === id);
      setRowState((s) => ({ ...s, [id]: 'skipped' }));
      setValues((v) => ({ ...v, ...Object.fromEntries(screen.fields.map((f) => [f.key, ''])) }));
      setErrors((e) => ({ ...e, ...Object.fromEntries(screen.fields.map((f) => [f.key, undefined])) }));
    },
    setField,
  };

  const onVitals = mode === 'manual' && step < VITALS_SCREENS.length;
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

  /** Sensor screen 1 → 2: every sensor row is confirmed; rows typed by hand must be valid. */
  function confirmAll(event) {
    event.preventDefault();
    const found = {};
    for (const s of SENSOR_SCREENS) if (rowState[s.id] === 'manual') Object.assign(found, validateScreen(s, values));
    setErrors(found);
    if (focusFirstError(found, SENSOR_SCREENS.flatMap((s) => s.fields.map((f) => f.key)))) return;
    setRowState((st) => Object.fromEntries(Object.entries(st).map(([id, v]) => [id, v === 'sensor' ? 'confirmed' : v])));
    setStep(1);
  }

  function back() {
    setErrors({});
    setSubmitError(null);
    if (step === 0) onCancel();
    else setStep((s) => s - 1);
  }

  function switchToManual() {
    setMode('manual');
    setStep(0);
    setErrors({});
    setValues((v) => ({ ...v, ...Object.fromEntries(SENSOR_SCREENS.flatMap((s) => s.fields.map((f) => [f.key, '']))) }));
  }

  /** Reading, provenance and context for the record. */
  function collect() {
    const reading = {};
    const provenance = {};
    for (const key of READING_KEYS) {
      const s = VITALS_SCREENS.find((sc) => sc.fields.some((f) => f.key === key));
      const state = mode === 'sensors' && s.id !== 'mood' ? rowState[s.id] : 'manual';
      if (state === 'skipped' || values[key] === '') {
        reading[key] = null;
        continue;
      }
      reading[key] = Number(values[key]);
      provenance[key] = state === 'confirmed' || state === 'sensor' ? 'sensor' : 'manual';
    }
    return { reading, provenance };
  }

  async function save(event, { withSleep, withMood, order }) {
    event.preventDefault();
    const found = validateContext(values, { withSleep, withMood });
    setErrors(found);
    if (focusFirstError(found, order)) return;

    const { reading, provenance } = collect();
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
      const at = stampFor(today);
      const result = scoreCheckinOnDevice({ crewId, reading, at, sensorDays });
      const record = makeVitalsRecord({
        crewId,
        reading,
        context,
        result,
        recordedAt: result.evaluated_at,
        provenance,
        // `devices` tells the onboard server this check-in was scored with the simulated sensor days.
        devices: sensorDays.length && sensorDay ? sensorDay.devices : undefined,
        enteredBy,
        demoEvents: sensorDays.length ? demoEvents : undefined,
      });
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

  const saveButtons = (
    <>
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
    </>
  );

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
      ) : mode === 'sensors' ? (
        <>
          <h2 id="checkin-title" className="checkin__title" ref={headingRef} tabIndex={-1}>
            Morning check-in: confirm and add
          </h2>
          <p className="muted checkin__intro">
            Your sensors recorded last night. Check the numbers, then add your mood
            {missionDay ? ` · Mission day ${missionDay}` : ''}
          </p>
          <p className="vprogress__text">
            Step <span className="num">{step + 1}</span> of <span className="num">2</span> ·{' '}
            {step === 0 ? 'Overnight from your sensors' : 'Mood and context'}
          </p>

          {step === 0 ? (
            <form ref={formRef} onSubmit={confirmAll} noValidate>
              <h3 className="vstep__title" ref={stageRef} tabIndex={-1}>
                Overnight from your sensors
              </h3>
              <p className="sensor-note">
                <span className="prov__sim">Simulated</span> These readings come from simulated wearable sensors (smart
                shirt, glucose monitor, temperature headband, wrist actigraph). Fix any that look wrong.
              </p>
              <SensorConfirm
                screens={SENSOR_SCREENS}
                sensorDay={sensorDay}
                rowState={rowState}
                values={values}
                errors={errors}
                statuses={preview}
                actions={rowActions}
              />
              <div className="checkin__actions">
                <button type="submit" className="btn btn--primary btn--lg">
                  Confirm all and continue
                </button>
                <button type="button" className="btn btn--secondary btn--lg" onClick={back}>
                  Cancel
                </button>
              </div>
              <p className="checkin__alt">
                <button type="button" className="link-btn" onClick={switchToManual}>
                  Enter everything by hand
                </button>
                <span className="muted"> · for when no sensors are available</span>
              </p>
            </form>
          ) : (
            <form ref={formRef} onSubmit={(e) => save(e, { withSleep: false, withMood: true, order: SENSOR_CONTEXT_ORDER })} noValidate>
              <h3 className="vstep__title" ref={stageRef} tabIndex={-1}>
                Mood and context
              </h3>
              <p className="muted">Sensors can’t know these. Only you can answer them.</p>
              <SegmentedField
                legend={MOOD_SCREEN.fields[0].label}
                name="mood"
                options={MOOD_OPTIONS}
                value={values.mood}
                onChange={setField('mood')}
                error={errors.mood}
                large
              >
                <div className="segmented__ends" aria-hidden="true">
                  <span>Very low</span>
                  <span>Very good</span>
                </div>
              </SegmentedField>
              <IsolationField values={values} errors={errors} setField={setField} />
              <CarriedQuestions values={values} errors={errors} setField={setField} carried={carried} />
              <NotesField values={values} setField={setField} />
              {saveButtons}
            </form>
          )}
        </>
      ) : (
        <>
          <h2 id="checkin-title" className="checkin__title" ref={headingRef} tabIndex={-1}>
            Daily check-in
          </h2>
          <p className="muted checkin__intro">
            Vitals, then isolation and confinement factors{missionDay ? ` · Mission day ${missionDay}` : ''}
          </p>
          {!sensorDay && <p className="sensor-note">No sensor data for today. Enter your readings by hand.</p>}
          <Progress step={step} />

          {onVitals ? (
            <form ref={formRef} onSubmit={next} noValidate key={screen.id}>
              <h3 className="vstep__title">{screen.title}</h3>
              <HowTo howTo={screen.howTo} whyId={screen.id} />
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
              {step === 0 && sensorDay && (
                <p className="checkin__alt">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setMode('sensors');
                      setStep(0);
                      setErrors({});
                      setRowState(initialRows(sensorDay));
                      setValues((v) => ({ ...v, ...sensorValues(sensorDay) }));
                    }}
                  >
                    Use my sensor readings instead
                  </button>
                </p>
              )}
            </form>
          ) : (
            <form ref={formRef} onSubmit={(e) => save(e, { withSleep: true, withMood: false, order: CONTEXT_ORDER })} noValidate>
              <h3 className="vstep__title">Context</h3>
              <IsolationField values={values} errors={errors} setField={setField} />

              <NumberField
                field={VITALS_SCREENS.find((s) => s.id === 'sleep_hours').fields[0]}
                value={values.sleep_hours}
                onChange={setField('sleep_hours')}
                error={errors.sleep_hours}
                hint="Filled in from your vitals. Change it here if it was wrong."
              />

              <CarriedQuestions values={values} errors={errors} setField={setField} carried={carried} />
              <NotesField values={values} setField={setField} />
              {saveButtons}
            </form>
          )}
        </>
      )}
    </section>
  );
}
