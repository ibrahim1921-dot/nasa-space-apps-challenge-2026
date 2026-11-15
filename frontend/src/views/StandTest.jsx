'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useHealthData } from '../hooks/useHealthData.js';
import { useStoredSetting } from '../hooks/useStoredSetting.js';
import { getStandTests } from '../services/healthService.js';
import {
  CRITERIA,
  READING_KEYS,
  READING_RANGES,
  SOURCE_ENTERED,
  SOURCE_SYNTHETIC,
  STANDING_WINDOW_MINUTES,
  SYMPTOMS,
  validateReading,
  validateStandTest,
} from '../lib/standTest.js';
import { makeRecord, readStandTests, writeStandTest } from '../lib/standTestStore.js';
import { scoreStandTestOnDevice } from '../lib/deviceScoring.js';
import { SCORED_LABEL } from '../lib/scoring.js';
import { useOnboard } from '../hooks/useOnboard.jsx';
import SyncBadge from '../components/SyncBadge.jsx';
import { getProfile } from '../constants/mission.js';
import { formatTime } from '../utils/format.js';
import StatusChip from '../components/StatusChip.jsx';
import SourceLabel from '../components/SourceLabel.jsx';
import ErrorPanel from '../components/ErrorPanel.jsx';
import StandTestChart from '../components/StandTestChart.jsx';
import ActionCard from '../components/ActionCard.jsx';
import LimitsInfo from '../components/LimitsInfo.jsx';

const REST_SECONDS = 5 * 60;
const MARK_1 = 60;
const MARK_3 = STANDING_WINDOW_MINUTES * 60; // last standing reading, at the end of the window in content/limits.js

const EMPTY_READING = { heart_rate: '', systolic: '', diastolic: '' };
const FIELD_LABEL = { heart_rate: 'Heart rate', systolic: 'Systolic BP', diastolic: 'Diastolic BP' };

const STEPS = [
  { id: 'rest', n: 1, title: 'Lie down and rest' },
  { id: 'stand', n: 2, title: 'Stand up' },
  { id: 'symptoms', n: 3, title: 'Any symptoms?' },
];

const SAFETY_TEXT = 'Do this with a crewmate nearby. If you feel faint, sit or lie down at once and stop the test.';

/** Seconds since `startedAt` (ms), plus `extra`, ticking 4x a second while `startedAt` is set. */
function useElapsed(startedAt, extra = 0) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? Math.max(0, (now - startedAt) / 1000) + extra : extra;
}

const clock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** { heart_rate, systolic, diastolic } as numbers, or null if any field is empty. */
function toReading(values) {
  if (READING_KEYS.some((k) => values[k] === '')) return null;
  return Object.fromEntries(READING_KEYS.map((k) => [k, Number(values[k])]));
}

/** For a stopped test: keep a reading only when it is complete and valid. */
function usableReading(values) {
  const r = toReading(values);
  return r && validateReading(r, 'reading') === null ? r : null;
}

function BigTimer({ seconds, label, caption, done }) {
  return (
    <div className={`bigtimer${done ? ' is-done' : ''}`}>
      <p className="bigtimer__label">{label}</p>
      <p className="bigtimer__digits num" role="timer" aria-label={`${label}: ${clock(seconds)}`}>
        {clock(seconds)}
      </p>
      {caption && <p className="bigtimer__caption">{caption}</p>}
    </div>
  );
}

function ReadingFields({ id, legend, hint, values, onChange, disabled, error }) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <fieldset className={`field reading${disabled ? ' is-locked' : ''}`} disabled={disabled} aria-describedby={error ? errorId : hintId}>
      <legend className="field__label">{legend}</legend>
      <p id={hintId} className="field__hint reading__hint">
        {hint}
      </p>
      <div className="reading__grid">
        {READING_KEYS.map((k) => {
          const { min, max, unit } = READING_RANGES[k];
          return (
            <div key={k} className="reading__field">
              <label htmlFor={`${id}-${k}`} className="reading__label">
                {FIELD_LABEL[k]} <span className="muted">({unit})</span>
              </label>
              <input
                id={`${id}-${k}`}
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                step="1"
                className="input reading__input num"
                value={values[k]}
                aria-invalid={error ? 'true' : undefined}
                onChange={(e) => onChange({ ...values, [k]: e.target.value })}
              />
            </div>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

const STAND_STEPS = [
  'Rest seated or lying down until you feel steady. Do not start EVA or heavy work.',
  'Re-test later, after resting and drinking fluids.',
  'Tell the Crew Medical Officer about this result.',
];

/** The stand test for the signed-in person only (no person picker: tests for others could not sync). */
export default function StandTest({ profileId, crewId, crewName: nameProp, focusSignal }) {
  const seeded = useHealthData(() => getStandTests());
  const [demoMode, setDemoMode] = useStoredSetting('ahm.demoMode.v1', false, (v) => typeof v === 'boolean');
  const profile = getProfile(profileId);

  const roster = seeded.data?.crew ?? [];

  const [phase, setPhase] = useState('intro'); // intro | rest | stand | symptoms | saving | result
  const [restStart, setRestStart] = useState(null);
  const [restSkip, setRestSkip] = useState(0);
  const [standStart, setStandStart] = useState(null);
  const [standSkip, setStandSkip] = useState(0);
  const [timingSkipped, setTimingSkipped] = useState(false);
  const [supine, setSupine] = useState(EMPTY_READING);
  const [s1, setS1] = useState(EMPTY_READING);
  const [s3, setS3] = useState(EMPTY_READING);
  const [symptoms, setSymptoms] = useState([]);
  const [errors, setErrors] = useState({});
  const [outcome, setOutcome] = useState(null); // { result, record, evaluatedOn, stored }
  const [saved, setSaved] = useState([]);
  const [announce, setAnnounce] = useState('');

  const restElapsed = useElapsed(phase === 'rest' ? restStart : null, restSkip);
  const standElapsed = useElapsed(phase === 'stand' ? standStart : null, standSkip);
  const restLeft = Math.max(0, REST_SECONDS - restElapsed);
  const restDone = restLeft === 0;
  const unlocked1 = standElapsed >= MARK_1;
  const unlocked3 = standElapsed >= MARK_3;

  const titleRef = useRef(null);
  const stepRef = useRef(null);
  const announcedRef = useRef(-1);

  // Re-read after the outbox syncs (it replaces the local copy with the stored one).
  const { version } = useOnboard();
  useEffect(() => {
    if (crewId) setSaved(readStandTests(crewId));
  }, [crewId, version]);

  // Arriving from the body map or the Today prompt: focus the view title.
  // On a first visit the title renders only once the seeded tests have loaded, so wait for that.
  useEffect(() => {
    if (focusSignal) titleRef.current?.focus();
  }, [focusSignal, seeded.loading]);

  // Each step change moves focus to that step's heading, so keyboard users start at the top.
  useEffect(() => {
    if (phase !== 'intro') stepRef.current?.focus();
    announcedRef.current = -1;
  }, [phase]);

  // Spoken updates once per minute, not every second.
  useEffect(() => {
    if (phase === 'rest') {
      const minutesLeft = Math.ceil(restLeft / 60);
      if (restDone && announcedRef.current !== 0) {
        announcedRef.current = 0;
        setAnnounce('Rest complete. Enter your lying-down heart rate and BP now.');
      } else if (!restDone && minutesLeft !== announcedRef.current) {
        announcedRef.current = minutesLeft;
        setAnnounce(`${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} of rest left.`);
      }
    }
    if (phase === 'stand') {
      const minute = Math.floor(standElapsed / 60);
      if (minute !== announcedRef.current && minute >= 1) {
        announcedRef.current = minute;
        if (minute === 1) setAnnounce('1 minute standing. Take your heart rate and BP now.');
        else if (minute === 3) setAnnounce('3 minutes standing. Take your heart rate and BP again now.');
        else setAnnounce(`${minute} minutes standing.`);
      }
    }
  }, [phase, restLeft, restDone, standElapsed]);

  const seededForCrew = useMemo(
    () => (seeded.data?.tests ?? []).filter((t) => t.crew_id === crewId).sort((a, b) => a.day_offset - b.day_offset),
    [seeded.data, crewId],
  );
  const crewName = nameProp ?? roster.find((c) => c.id === crewId)?.name ?? crewId;

  function reset() {
    setPhase('intro');
    setRestStart(null);
    setRestSkip(0);
    setStandStart(null);
    setStandSkip(0);
    setTimingSkipped(false);
    setSupine(EMPTY_READING);
    setS1(EMPTY_READING);
    setS3(EMPTY_READING);
    setSymptoms([]);
    setErrors({});
    setOutcome(null);
    setAnnounce('');
  }

  function start() {
    reset();
    setRestStart(Date.now());
    setPhase('rest');
  }

  function checkReading(values, label) {
    const r = toReading(values);
    if (!r) return { error: `Enter all three values for ${label}.` };
    const problem = validateReading(r, label);
    if (!problem) return { reading: r };
    // Turn "label.systolic (systolic BP) is 300; expected…" into "Systolic BP is 300; expected…".
    const plain = problem.replace(`${label}.`, '').replace(/^\w+ \((.+?)\)/, '$1').replace(`${label}: `, '');
    return { error: plain.charAt(0).toUpperCase() + plain.slice(1) };
  }

  function goStand() {
    const { error } = checkReading(supine, 'lying down');
    if (error) {
      setErrors({ supine: error });
      return;
    }
    setErrors({});
    setStandStart(Date.now());
    setPhase('stand');
  }

  function goSymptoms() {
    const a = checkReading(s1, 'standing at 1 min');
    const b = checkReading(s3, 'standing at 3 min');
    if (a.error || b.error) {
      setErrors({ s1: a.error, s3: b.error });
      return;
    }
    setErrors({});
    setPhase('symptoms');
  }

  // The Skip button disappears once the wait is over, so move focus to the first field to fill in.
  function focusAfterRender(id) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  function skipWait() {
    setTimingSkipped(true);
    if (phase === 'rest') {
      setRestSkip((s) => s + restLeft);
      focusAfterRender('supine-heart_rate');
    }
    if (phase === 'stand') {
      setStandSkip((s) => s + Math.max(0, MARK_3 - standElapsed));
      focusAfterRender(toReading(s1) ? 'standing3-heart_rate' : 'standing1-heart_rate');
    }
  }

  function done() {
    reset();
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  // Enter in a field submits the step.
  const onSubmitStep = (fn) => (e) => {
    e.preventDefault();
    fn();
  };

  async function submit(test) {
    setPhase('saving');
    const problem = validateStandTest(test, 'test');
    if (problem) {
      // Should not happen: the steps validate first. Show it rather than saving bad data.
      setErrors({ submit: problem });
      setPhase('symptoms');
      return;
    }
    // Offline-first: scored here against the bundled preflight tests (the same engine and data the
    // onboard server uses), saved on this device, then copied to the onboard server by the outbox.
    const result = { ...scoreStandTestOnDevice({ crewId, test }), criteria: CRITERIA };
    const record = makeRecord({
      crewId,
      test,
      status: result.status,
      reasons: result.reasons,
      engineVersion: result.engine_version,
      scoredOn: result.scored_on,
    });
    const stored = writeStandTest(record);
    setSaved((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
    setOutcome({ result, record, evaluatedOn: 'device', stored });
    setPhase('result');
  }

  function finish() {
    submit({
      supine: toReading(supine),
      standing_1min: toReading(s1),
      standing_3min: toReading(s3),
      symptoms,
      partial: false,
      timing_skipped: timingSkipped,
    });
  }

  function stopTest() {
    submit({
      supine: usableReading(supine),
      standing_1min: usableReading(s1),
      standing_3min: usableReading(s3),
      symptoms: symptoms.includes('felt_faint') ? symptoms : [...symptoms, 'felt_faint'],
      partial: true,
      timing_skipped: timingSkipped,
    });
  }

  const inFlow = phase === 'rest' || phase === 'stand' || phase === 'symptoms';
  const step = STEPS.find((s) => s.id === phase);

  if (seeded.loading) {
    return (
      <section className="card card--lg" aria-busy="true">
        <span className="skel" style={{ width: 220, height: 22 }} />
      </section>
    );
  }

  return (
    <div className="stand">
      <section className="card card--lg" aria-labelledby="stand-title">
        <div className="sleep__head">
          <div>
            <h2 id="stand-title" ref={titleRef} tabIndex={-1} className="view-title stand__title">
              Stand test
            </h2>
            <p className="muted">
              A check of how heart rate and BP respond when you stand up after lying down. Compared with general limits
              and with this person&apos;s own preflight tests.
            </p>
          </div>
          <div className="stand__controls">
            <p className="stand__person">
              <span className="field__label">Person</span> <strong>{crewName}</strong>
            </p>
            <label className="toggle">
              <input
                type="checkbox"
                className="toggle__input"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
              />
              <span className="toggle__track" aria-hidden="true" />
              <span className="toggle__text">
                Demo mode <span className="muted">(shows “Skip wait”)</span>
              </span>
            </label>
          </div>
        </div>
        <LimitsInfo limitKey="stand_test" />
        {seeded.error && <ErrorPanel onRetry={seeded.reload} />}
        <SourceLabel source={`Preflight comparison: ${seeded.data?.source ?? SOURCE_SYNTHETIC} seeded tests`} />
      </section>

      <div className="stand__layout">
        <section className="card card--lg stand__flow" aria-label="Guided stand test">
          <div className="safety" role="note">
            <svg className="safety__icon" viewBox="0 0 16 16" width="22" height="22" aria-hidden="true" focusable="false">
              <path d="M8 1.8 15 14H1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M8 6.3v3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="8" cy="11.9" r="0.6" fill="currentColor" />
            </svg>
            <p className="safety__text">{SAFETY_TEXT}</p>
            {inFlow && (
              <button type="button" className="btn btn--stop" onClick={stopTest}>
                Stop test
              </button>
            )}
          </div>

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {announce}
          </p>

          {inFlow && (
            <ol className="steps" aria-label="Progress">
              {STEPS.map((s) => (
                <li
                  key={s.id}
                  className={`steps__item${s.id === phase ? ' is-current' : ''}${s.n < step.n ? ' is-done' : ''}`}
                  aria-current={s.id === phase ? 'step' : undefined}
                >
                  <span className="steps__n num">{s.n}</span> {s.title}
                </li>
              ))}
            </ol>
          )}

          {phase === 'intro' && (
            <div className="stand__step">
              <h3 className="stand__step-title">Before you start</h3>
              <ul className="stand__needs">
                <li>A BP cuff that also shows heart rate.</li>
                <li>A crewmate nearby for the whole test.</li>
                <li>Space to lie flat and then stand without holding on.</li>
              </ul>
              <p className="muted">
                The test takes about 9 minutes: 5 min lying down, then 3 min standing still. You can stop at any time.
              </p>
              <div className="checkin__actions">
                <button type="button" className="btn btn--primary btn--lg" onClick={start} disabled={!crewId}>
                  Start: lie down
                </button>
              </div>
            </div>
          )}

          {phase === 'rest' && (
            <form className="stand__step" noValidate onSubmit={onSubmitStep(goStand)}>
              <h3 ref={stepRef} tabIndex={-1} className="stand__step-title">
                Step 1 of 3: Lie down and rest
              </h3>
              <p>Lie flat and stay still. Take your heart rate and BP when the timer reaches 0:00.</p>
              <BigTimer
                seconds={restLeft}
                label="Rest time left"
                done={restDone}
                caption={restDone ? 'Rest complete. Take your readings while still lying down.' : null}
              />
              {demoMode && !restDone && (
                <button type="button" className="btn btn--secondary" onClick={skipWait}>
                  Skip wait (demo)
                </button>
              )}
              <ReadingFields
                id="supine"
                legend="Lying down, after 5 min rest"
                hint={restDone ? 'Enter the readings from the cuff.' : 'Unlocks when the rest timer reaches 0:00.'}
                values={supine}
                onChange={setSupine}
                disabled={!restDone}
                error={errors.supine}
              />
              <div className="checkin__actions">
                <button type="submit" className="btn btn--primary btn--lg" disabled={!restDone}>
                  Next: stand up
                </button>
              </div>
            </form>
          )}

          {phase === 'stand' && (
            <form className="stand__step" noValidate onSubmit={onSubmitStep(goSymptoms)}>
              <h3 ref={stepRef} tabIndex={-1} className="stand__step-title">
                Step 2 of 3: Stand up
              </h3>
              <p>Stand up now and stay still, arms by your sides. Take readings at 1:00 and again at 3:00.</p>
              <BigTimer
                seconds={standElapsed}
                label="Time standing"
                done={unlocked3}
                caption={
                  unlocked3
                    ? 'Take the 3 min reading now, then continue.'
                    : unlocked1
                      ? `Take the 1 min reading now. Next reading at 3:00 (in ${clock(MARK_3 - standElapsed)}).`
                      : `First reading at 1:00 (in ${clock(MARK_1 - standElapsed)}).`
                }
              />
              {demoMode && !unlocked3 && (
                <button type="button" className="btn btn--secondary" onClick={skipWait}>
                  Skip wait (demo)
                </button>
              )}
              <ReadingFields
                id="standing1"
                legend="Standing, at 1 min"
                hint={unlocked1 ? 'Enter the readings from the cuff.' : 'Unlocks at 1:00.'}
                values={s1}
                onChange={setS1}
                disabled={!unlocked1}
                error={errors.s1}
              />
              <ReadingFields
                id="standing3"
                legend="Standing, at 3 min"
                hint={unlocked3 ? 'Enter the readings from the cuff.' : 'Unlocks at 3:00.'}
                values={s3}
                onChange={setS3}
                disabled={!unlocked3}
                error={errors.s3}
              />
              <div className="checkin__actions">
                <button type="submit" className="btn btn--primary btn--lg" disabled={!unlocked3}>
                  Next: symptoms
                </button>
              </div>
            </form>
          )}

          {phase === 'symptoms' && (
            <form className="stand__step" noValidate onSubmit={onSubmitStep(finish)}>
              <h3 ref={stepRef} tabIndex={-1} className="stand__step-title">
                Step 3 of 3: Any symptoms?
              </h3>
              <p>You can sit down now.</p>
              <fieldset className="field">
                <legend className="field__label">While standing, did you have any of these? Tick all that apply.</legend>
                <div className="symptoms">
                  {SYMPTOMS.map((s) => (
                    <label key={s.id} className="symptom">
                      <input
                        type="checkbox"
                        className="symptom__input"
                        checked={symptoms.includes(s.id)}
                        onChange={(e) =>
                          setSymptoms((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))
                        }
                      />
                      <span>{s.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {errors.submit && (
                <p className="field__error" role="alert">
                  {errors.submit}
                </p>
              )}
              <div className="checkin__actions">
                <button type="submit" className="btn btn--primary btn--lg">
                  See result
                </button>
              </div>
            </form>
          )}

          {phase === 'saving' && (
            <p className="stand__step" role="status">
              Checking the result…
            </p>
          )}

          {phase === 'result' && outcome && (
            <div className="stand__step">
              <div className="stand__result-head">
                <h3 ref={stepRef} tabIndex={-1} className="stand__step-title">
                  Result for {crewName}
                </h3>
                <StatusChip status={outcome.result.status} />
              </div>
              <ul className="stand__reasons">
                {outcome.result.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <ActionCard status={outcome.result.status} profile={profile} steps={STAND_STEPS} />
              <h4 className="stand__chart-title">Compared with preflight tests</h4>
              <StandTestChart
                changes={outcome.result.changes}
                preflight={outcome.result.preflight}
                criteria={outcome.result.criteria ?? seeded.data?.criteria}
              />
              {outcome.stored && (
                <p className="vresult__sync">
                  <SyncBadge record={outcome.record} showScoredOn />
                </p>
              )}
              <p className="muted stand__saved-note">
                {outcome.stored
                  ? 'Stand test saved.'
                  : 'This browser could not save the result, so it will be gone after a reload.'}
              </p>
              <div className="checkin__actions">
                <button type="button" className="btn btn--secondary" onClick={done}>
                  Done
                </button>
              </div>
              <SourceLabel
                source={`This test: ${SOURCE_ENTERED} · Preflight: ${outcome.result.preflight_source ?? SOURCE_SYNTHETIC} · ${SCORED_LABEL[outcome.evaluatedOn]}`}
              />
            </div>
          )}

          {phase !== 'result' && <SourceLabel source={SOURCE_ENTERED} />}
        </section>

        <aside className="stand__side">
          <section className="card" aria-labelledby="seeded-title">
            <h3 id="seeded-title" className="card__title">
              Earlier tests for {crewName}
            </h3>
            <ul className="stand__history">
              {seededForCrew.map((t) => (
                <li key={t.id} className="stand__history-row">
                  <span className="num">{t.timepoint}</span>
                  <span className="muted">{t.phase === 'preflight' ? 'Preflight' : 'After landing'}</span>
                  <StatusChip status={t.result.status} />
                </li>
              ))}
            </ul>
            <SourceLabel source={seeded.data?.source ?? SOURCE_SYNTHETIC} />
          </section>

          <section className="card" aria-labelledby="saved-title">
            <h3 id="saved-title" className="card__title">
              Saved on this device
            </h3>
            {saved.length === 0 ? (
              <p className="muted">No stand tests saved for {crewName} yet.</p>
            ) : (
              <ul className="stand__history">
                {saved.slice(0, 8).map((r) => (
                  <li key={r.id} className="stand__history-row">
                    <time dateTime={r.recorded_at}>
                      {new Date(r.recorded_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{' '}
                      {formatTime(r.recorded_at)}
                    </time>
                    <span className="muted">{r.payload.partial ? 'Stopped early' : 'Full test'}</span>
                    <StatusChip status={r.status} />
                    <SyncBadge record={r} />
                  </li>
                ))}
              </ul>
            )}
            <SourceLabel source={`${SOURCE_ENTERED} · copied to the onboard server when reachable`} />
          </section>
        </aside>
      </div>
    </div>
  );
}
