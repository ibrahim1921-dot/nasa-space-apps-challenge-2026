'use client';

// Crew Medical Officer exam for a crew member: one reading per screen (blood pressure, heart rate,
// blood sugar, temperature), each showing the crew member's latest simulated sensor value with
// "Use sensor value" / "Measure now" / "Skip", then an optional note.
// Only "Measure now" values are stored (provenance 'cmo_exam'); "Use sensor value" leaves the field
// null, because the sensor day already holds it and the timeline keeps it. No mood, sleep or context:
// the CMO cannot answer those for someone. Scored on this device against the crew member's own
// history, saved here, and copied to the onboard server by the CMO's outbox.

import { useEffect, useMemo, useRef, useState } from 'react';
import { scoreCheckinOnDevice } from '../lib/deviceScoring.js';
import { VITALS_SCREENS } from '../constants/vitals.js';
import { getProfile } from '../constants/mission.js';
import { CMO_EXAM, READING_KEYS } from '../lib/vitalsCheckin.js';
import { MAX_NOTE } from '../lib/provenance.js';
import { DEVICES, DEVICE_OF_READING } from '../lib/sensorFeed.js';
import { makeVitalsRecord, readVitalsCheckins, writeVitalsCheckin } from '../lib/vitalsCheckinStore.js';
import { mergedDayRecord } from '../lib/sensorRecords.js';
import { crewDaysOf } from '../data/bundled.js';
import CheckinResult from './CheckinResult.jsx';
import { HowTo, NumberField, validateScreen } from './CheckinFields.jsx';

/** What an exam measures, in order. Mood and sleep are the crew member's own answers. */
export const EXAM_SCREENS = VITALS_SCREENS.filter((s) => ['blood_pressure', 'heart_rate', 'glucose', 'temperature'].includes(s.id));
const TOTAL = EXAM_SCREENS.length + 1;
const DAY_KEY = { systolic: 'systolic', diastolic: 'diastolic', heart_rate: 'heartRate', glucose: 'glucose', temperature: 'temperature' };
const CHOICE_TEXT = { sensor: 'Sensor value used', measure: 'Measured now', skip: 'Skipped' };

const stampFor = (today) => (today ? `${today}T${new Date().toISOString().slice(11)}` : new Date().toISOString());
const first = (name) => (name ?? '').split(' ')[0];
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The newest sensor day (on or before the demo's today) that has every value of this screen. */
function latestSensor(screen, sensorDays, today) {
  for (let i = sensorDays.length - 1; i >= 0; i -= 1) {
    const d = sensorDays[i];
    if (!d || (today && d.date > today)) continue;
    const values = screen.fields.map((f) => d[DAY_KEY[f.key]]);
    if (values.every((v) => typeof v === 'number')) {
      return { date: d.date, text: values.join('/'), unit: screen.fields[0].unit, device: DEVICE_OF_READING[screen.fields[0].key] };
    }
  }
  return null;
}

function Progress({ step, name }) {
  return (
    <div className="vprogress">
      <p className="vprogress__text">
        Step <span className="num">{step + 1}</span> of <span className="num">{TOTAL}</span> · {name}
      </p>
      <div className="vprogress__bar" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step + 1} aria-label="Exam progress">
        <span style={{ width: `${Math.round(((step + 1) / TOTAL) * 100)}%` }} />
      </div>
    </div>
  );
}

/**
 * @param {{ patientId: string, patientName: string, examiner: { crew_id, name, role }, today: string|null,
 *   missionDay?: number|null, sensorDays: object[], demoEvents: object[], profileId: string,
 *   onSaved: (record) => void, onCancel: () => void }} props
 */
export default function ExamForm({ patientId, patientName, examiner, today = null, missionDay = null, sensorDays = [], demoEvents = [], profileId, onSaved, onCancel }) {
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState({}); // screen id → 'sensor' | 'measure' | 'skip'
  const [values, setValues] = useState(() => Object.fromEntries(READING_KEYS.map((k) => [k, ''])));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState('form'); // 'form' | 'saving' | 'result'
  const [submitError, setSubmitError] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const headingRef = useRef(null);
  const stageRef = useRef(null);
  const firstRender = useRef(true);
  const profile = getProfile(profileId);
  const visible = useMemo(() => sensorDays.filter((d) => d && (!today || d.date <= today)), [sensorDays, today]);
  const sensorOf = useMemo(() => Object.fromEntries(EXAM_SCREENS.map((s) => [s.id, latestSensor(s, visible, today)])), [visible, today]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      headingRef.current?.focus();
      return;
    }
    stageRef.current?.focus();
  }, [step]);

  const onReading = step < EXAM_SCREENS.length;
  const screen = onReading ? EXAM_SCREENS[step] : null;
  const title = `Exam for ${patientName} · recorded by ${examiner.name} (CMO)`;

  const setField = (key) => (v) => {
    setValues((s) => ({ ...s, [key]: v }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  function choose(id, c) {
    setChoice((s) => ({ ...s, [id]: c }));
    setErrors({});
    if (c !== 'measure') {
      const scr = EXAM_SCREENS.find((s) => s.id === id);
      setValues((v) => ({ ...v, ...Object.fromEntries(scr.fields.map((f) => [f.key, ''])) }));
      setStep((s) => s + 1);
    } else {
      setTimeout(() => document.getElementById(`exam-${EXAM_SCREENS.find((s) => s.id === id).fields[0].key}`)?.focus(), 0);
    }
  }

  function next(event) {
    event.preventDefault();
    const found = validateScreen(screen, values);
    setErrors(found);
    const firstKey = screen.fields.find((f) => found[f.key])?.key;
    if (firstKey) {
      document.getElementById(`exam-${firstKey}`)?.focus();
      return;
    }
    setStep((s) => s + 1);
  }

  function back() {
    setErrors({});
    setSubmitError(null);
    if (step === 0) onCancel();
    else setStep((s) => s - 1);
  }

  const measured = EXAM_SCREENS.filter((s) => choice[s.id] === 'measure');

  function save(event) {
    event.preventDefault();
    if (!measured.length) {
      setSubmitError('Measure at least one reading, or cancel the exam. Sensor values are already on the record.');
      return;
    }
    const reading = Object.fromEntries(READING_KEYS.map((k) => [k, null]));
    const provenance = {};
    for (const s of measured) for (const f of s.fields) {
      reading[f.key] = Number(values[f.key]);
      provenance[f.key] = CMO_EXAM;
    }
    setPhase('saving');
    setSubmitError(null);
    try {
      const at = stampFor(today);
      const result = scoreCheckinOnDevice({ crewId: patientId, reading, at, sensorDays: visible, kindDetail: CMO_EXAM });
      const latestDay = visible.at(-1) ?? null;
      const record = makeVitalsRecord({
        crewId: patientId,
        reading,
        context: null,
        result,
        recordedAt: result.evaluated_at,
        provenance,
        devices: visible.length && latestDay ? latestDay.devices : undefined,
        enteredBy: examiner,
        demoEvents: visible.length ? demoEvents : undefined,
        kindDetail: CMO_EXAM,
        note: note.trim().slice(0, MAX_NOTE) || undefined,
      });
      const stored = writeVitalsCheckin(record);
      const saved = stored ? readVitalsCheckins(patientId) : [record, ...readVitalsCheckins(patientId)];
      const day = mergedDayRecord({ crewId: patientId, crewDays: crewDaysOf(patientId), sensorDays: visible, saved, examId: record.id }) ?? record;
      setOutcome({ record, stored, day });
      setPhase('result');
      window.scrollTo(0, 0);
    } catch (err) {
      setSubmitError(`Could not check the readings: ${err.message}. The values are still here; please try again.`);
      setPhase('form');
    }
  }

  const pill = <span className="cmo-pill">CMO</span>;

  if (phase === 'result' && outcome) {
    const confirmed = EXAM_SCREENS.filter((s) => choice[s.id] === 'sensor' && sensorOf[s.id]);
    return (
      <section className="card card--lg checkin exam" aria-labelledby="exam-title">
        <p className="exam__eyebrow">{pill} Exam</p>
        <CheckinResult
          record={outcome.record}
          chipRecord={outcome.day}
          result={outcome.record.payload.result}
          profile={profile}
          stored={outcome.stored}
          crewName={patientName}
          attribution={`Recorded by ${first(examiner.name)} (CMO) for ${first(patientName)}`}
          onDone={() => onSaved(outcome.record)}
        >
          {confirmed.length > 0 && (
            <p className="muted exam__confirmed">
              Sensor values confirmed (not stored in the exam, already on the record):{' '}
              {confirmed.map((s) => `${s.title} ${sensorOf[s.id].text} ${sensorOf[s.id].unit}`).join(' · ')}
            </p>
          )}
          {outcome.record.payload.note && (
            <p className="exam__note">
              <span className="muted">Note: </span>
              {outcome.record.payload.note}
            </p>
          )}
        </CheckinResult>
      </section>
    );
  }

  return (
    <section className="card card--lg checkin exam" aria-labelledby="exam-title">
      <p className="exam__eyebrow">{pill} Exam</p>
      <h2 id="exam-title" className="checkin__title" ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
      <p className="muted checkin__intro">
        Measured values are saved for {first(patientName)}, marked as your exam{missionDay ? ` · Mission day ${missionDay}` : ''}.
      </p>
      <Progress step={step} name={onReading ? screen.title : 'Note'} />

      {onReading ? (
        <form onSubmit={next} noValidate key={screen.id}>
          <h3 className="vstep__title" ref={stageRef} tabIndex={-1}>
            {screen.title}
          </h3>
          <HowTo howTo={screen.howTo} screenId={screen.id} />
          <div className="exam__sensor">
            {sensorOf[screen.id] ? (
              <p>
                <span className="muted">{first(patientName)}’s latest sensor value: </span>
                <span className="num exam__sensor-value">{sensorOf[screen.id].text}</span> {sensorOf[screen.id].unit}
                <span className="muted">
                  {' '}
                  · {DEVICES[sensorOf[screen.id].device].label}
                  {sensorOf[screen.id].date !== today ? `, ${shortDate(sensorOf[screen.id].date)}` : ', today'}
                </span>{' '}
                <span className="prov__sim">Simulated</span>
              </p>
            ) : (
              <p className="muted">No sensor value for {first(patientName)} yet.</p>
            )}
          </div>
          <div className="exam__choices" role="group" aria-label={`${screen.title}: how to record it`}>
            <button type="button" className="btn btn--secondary btn--lg" onClick={() => choose(screen.id, 'sensor')} disabled={!sensorOf[screen.id]} aria-pressed={choice[screen.id] === 'sensor'}>
              Use sensor value
            </button>
            <button type="button" className="btn btn--secondary btn--lg" onClick={() => choose(screen.id, 'measure')} aria-pressed={choice[screen.id] === 'measure'}>
              Measure now
            </button>
            <button type="button" className="btn btn--secondary btn--lg" onClick={() => choose(screen.id, 'skip')} aria-pressed={choice[screen.id] === 'skip'}>
              Skip
            </button>
          </div>
          {choice[screen.id] === 'measure' && (
            <div className="exam__measure">
              {screen.fields.map((f) => (
                <NumberField key={f.key} field={f} value={values[f.key]} onChange={setField(f.key)} error={errors[f.key]} idPrefix="exam" />
              ))}
            </div>
          )}
          <div className="checkin__actions">
            {choice[screen.id] === 'measure' && (
              <button type="submit" className="btn btn--primary btn--lg">
                Next
              </button>
            )}
            <button type="button" className="btn btn--secondary btn--lg" onClick={back}>
              {step === 0 ? 'Cancel' : 'Back'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={save} noValidate>
          <h3 className="vstep__title" ref={stageRef} tabIndex={-1}>
            Note
          </h3>
          <ul className="exam__summary" aria-label="Exam so far">
            {EXAM_SCREENS.map((s) => (
              <li key={s.id}>
                <span>{s.title}</span>
                <span className="muted">
                  {choice[s.id] === 'measure'
                    ? `${s.fields.map((f) => values[f.key]).join('/')} ${s.fields[0].unit}`
                    : CHOICE_TEXT[choice[s.id] ?? 'skip']}
                </span>
              </li>
            ))}
          </ul>
          <div className="field">
            <label htmlFor="exam-note" className="field__label">
              Note <span className="muted">(optional)</span>
            </label>
            <textarea id="exam-note" name="note" rows={3} maxLength={MAX_NOTE} className="input" value={note} onChange={(e) => setNote(e.target.value)} aria-describedby="exam-note-count" />
            <p id="exam-note-count" className="muted exam__count">
              {note.length}/{MAX_NOTE}
            </p>
          </div>
          {submitError && (
            <p className="field__error" role="alert">
              {submitError}
            </p>
          )}
          <div className="checkin__actions">
            <button type="submit" className="btn btn--primary btn--lg" disabled={phase === 'saving'}>
              {phase === 'saving' ? 'Checking…' : 'Save exam and see results'}
            </button>
            <button type="button" className="btn btn--secondary btn--lg" onClick={back} disabled={phase === 'saving'}>
              Back
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
