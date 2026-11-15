'use client';

import { useEffect, useRef, useState } from 'react';
import { ACTIVITY_SETTINGS, FEELINGS, LOGGED_NOT_SCORED } from '../../content/activities.js';
import { breathPhase, calmOrbitData } from '../../lib/activities.js';
import LeaveConfirm, { useEscape } from './LeaveConfirm.jsx';

const C = ACTIVITY_SETTINGS.calm;
const TOTAL_MS = C.minutes * 60 * 1000;
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Calm Orbit: 2 minutes of paced breathing at 6 breaths a minute (5 s in, 5 s out). A planet grows and
 * shrinks with the breath; with reduced motion there is no scaling, only the text and a seconds count.
 * Then one question: "How do you feel now?". Saved to the activity log only; never the check-in mood.
 * @param {{ onSave: (data) => { ok: boolean, error?: string }, onExit: () => void }} props
 */
export default function CalmOrbit({ onSave, onExit }) {
  const [phase, setPhase] = useState('ready'); // ready | breathing | question | saved
  const [elapsed, setElapsed] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const startRef = useRef(0);
  const pausedRef = useRef(0);
  const timerRef = useRef(null);
  const headingRef = useRef(null);
  const questionRef = useRef(null);

  useEffect(() => headingRef.current?.focus(), []);
  useEffect(() => () => clearInterval(timerRef.current), []);
  useEffect(() => {
    if (phase === 'question') questionRef.current?.focus();
  }, [phase]);

  function tick() {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const e = performance.now() - startRef.current;
      if (e >= TOTAL_MS) {
        clearInterval(timerRef.current);
        setPhase('question');
      }
      setElapsed(Math.min(e, TOTAL_MS));
    }, 200);
  }

  function start() {
    startRef.current = performance.now();
    setElapsed(0);
    setPhase('breathing');
    tick();
  }

  function askLeave() {
    if (phase !== 'breathing' && phase !== 'question') return onExit();
    clearInterval(timerRef.current);
    pausedRef.current = performance.now();
    setConfirming(true);
  }
  useEscape(askLeave, !confirming);

  function stay() {
    setConfirming(false);
    if (phase === 'breathing') {
      startRef.current += performance.now() - pausedRef.current;
      tick();
    }
  }

  function answer(feeling) {
    const res = onSave(calmOrbitData(feeling));
    if (!res.ok) return setError(res.error);
    setPhase('saved');
  }

  const b = breathPhase(elapsed);

  return (
    <section className="card card--lg act-screen" aria-labelledby="co-title">
      <div className="act-screen__head">
        <h2 id="co-title" ref={headingRef} tabIndex={-1} className="view-title">
          Calm Orbit
        </h2>
        {phase !== 'saved' && (
          <button type="button" className="link-btn act-leave" onClick={askLeave}>
            Leave
          </button>
        )}
      </div>

      {phase === 'ready' && (
        <>
          <p>
            Breathe with the planet for {C.minutes} minutes: in for {C.inhaleS} s, out for {C.exhaleS} s. Six slow breaths a
            minute.
          </p>
          <p className="muted">Sit or float comfortably. {LOGGED_NOT_SCORED}.</p>
          <div className="act-actions">
            <button type="button" className="btn act-btn btn--lg" onClick={start}>
              Start
            </button>
          </div>
        </>
      )}

      {phase === 'breathing' && (
        <div className="co-stage">
          <div className={`co-orbit${confirming ? ' is-paused' : ''}`} aria-hidden="true">
            <span className="co-planet" />
          </div>
          <p className="co-phase" aria-live="polite">
            {b.phase === 'in' ? 'Breathe in' : 'Breathe out'}
          </p>
          <p className="co-count num" aria-hidden="true">
            {b.secondsLeft}
          </p>
          <p className="muted act-timer">
            <span className="num">{clock(TOTAL_MS - elapsed)}</span> left
          </p>
        </div>
      )}

      {phase === 'question' && (
        <fieldset className="co-question">
          <legend ref={questionRef} tabIndex={-1} className="card__title">
            How do you feel now?
          </legend>
          <div className="co-answers">
            {FEELINGS.map((f) => (
              <button key={f.value} type="button" className="btn btn--secondary act-choice" onClick={() => answer(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
      )}

      {phase === 'saved' && (
        <>
          <p role="status">Saved. Well done for taking two minutes.</p>
          <p className="act-tag">{LOGGED_NOT_SCORED}</p>
          <div className="act-actions">
            <button type="button" className="btn act-btn" onClick={onExit}>
              Back to activities
            </button>
          </div>
        </>
      )}

      {confirming && <LeaveConfirm onLeave={onExit} onStay={stay} />}
    </section>
  );
}
