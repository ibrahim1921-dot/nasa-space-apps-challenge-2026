'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVITY_SETTINGS, LOGGED_NOT_SCORED } from '../../content/activities.js';
import { GATE_TEXT, nextWaitMs, scoreReactionRun } from '../../lib/activities.js';
import LeaveConfirm, { useEscape } from './LeaveConfirm.jsx';

const R = ACTIVITY_SETTINGS.reaction;
const COUNTDOWN_S = 3;
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Reaction Run: 3 minutes; a shape with "TAP" appears after a random 2–10 s wait. Tap the area or press
 * Space. A tap before the shape is a false start; over 500 ms is a lapse. Saved only when the 3 minutes
 * are over. With reduced motion the shape just appears (no animation, no flashing).
 * @param {{ onSave: (data) => { ok: boolean, error?: string }, onExit: () => void, usual: object|null, gate: 'open'|'rest'|'done' }} props
 */
export default function ReactionRun({ onSave, onExit, usual, gate }) {
  const [phase, setPhase] = useState('ready'); // ready | countdown | wait | stimulus | results
  const [count, setCount] = useState(COUNTDOWN_S);
  const [left, setLeft] = useState(R.sessionMs);
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const s = useRef({ reactions: [], falseStarts: 0, endAt: 0, shownAt: 0, timer: null, tick: null, pausedAt: 0 });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const areaRef = useRef(null);
  const headingRef = useRef(null);

  const clearTimers = () => {
    clearTimeout(s.current.timer);
    clearInterval(s.current.tick);
  };
  useEffect(() => clearTimers, []);
  useEffect(() => headingRef.current?.focus(), []);

  const finish = useCallback(() => {
    clearTimers();
    const data = scoreReactionRun({ reactions: s.current.reactions, falseStarts: s.current.falseStarts });
    const res = onSave(data);
    setSaveError(res.ok ? null : res.error);
    setResult(data);
    setPhase('results');
  }, [onSave]);

  const scheduleNext = useCallback(() => {
    clearTimeout(s.current.timer);
    if (performance.now() >= s.current.endAt) return finish();
    setPhase('wait');
    s.current.timer = setTimeout(() => {
      if (performance.now() >= s.current.endAt) return finish();
      s.current.shownAt = performance.now();
      setPhase('stimulus');
      setNote('');
      // No tap in time: a lapse with no time.
      s.current.timer = setTimeout(() => {
        s.current.reactions.push(null);
        setNote('Missed one. Stay ready.');
        scheduleNext();
      }, R.timeoutMs);
    }, nextWaitMs());
  }, [finish]);

  const startTicking = useCallback(() => {
    clearInterval(s.current.tick);
    s.current.tick = setInterval(() => {
      const remaining = s.current.endAt - performance.now();
      setLeft(remaining);
      if (remaining <= 0 && phaseRef.current !== 'stimulus') finish();
    }, 250);
  }, [finish]);

  function start() {
    s.current = { ...s.current, reactions: [], falseStarts: 0 };
    setNote('');
    setCount(COUNTDOWN_S);
    setLeft(R.sessionMs);
    setPhase('countdown');
    areaRef.current?.focus();
    let c = COUNTDOWN_S;
    s.current.tick = setInterval(() => {
      c -= 1;
      setCount(c);
      if (c <= 0) {
        clearInterval(s.current.tick);
        s.current.endAt = performance.now() + R.sessionMs;
        startTicking();
        scheduleNext();
      }
    }, 1000);
  }

  const respond = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'wait') {
      s.current.falseStarts += 1;
      setNote('Too soon. Wait for the shape.');
      scheduleNext();
    } else if (p === 'stimulus') {
      const rt = Math.round(performance.now() - s.current.shownAt);
      s.current.reactions.push(rt);
      setNote(`${rt} ms`);
      if (performance.now() >= s.current.endAt) finish();
      else scheduleNext();
    }
  }, [scheduleNext, finish]);

  // Space responds while a session runs.
  useEffect(() => {
    const onKey = (e) => {
      if (confirming || (e.code !== 'Space' && e.key !== ' ')) return;
      if (phaseRef.current === 'wait' || phaseRef.current === 'stimulus') {
        e.preventDefault();
        if (!e.repeat) respond();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [respond, confirming]);

  const running = phase === 'countdown' || phase === 'wait' || phase === 'stimulus';

  // Leaving: ask first while a session runs (the game pauses), otherwise just leave.
  function askLeave() {
    if (!running) return onExit();
    clearTimers();
    s.current.pausedAt = performance.now();
    setConfirming(true);
  }
  useEscape(askLeave, !confirming);

  function resume() {
    setConfirming(false);
    if (phaseRef.current === 'countdown') return start();
    s.current.endAt += performance.now() - s.current.pausedAt;
    startTicking();
    scheduleNext();
  }

  if (phase === 'results' && result) {
    return (
      <section className="card card--lg act-screen" aria-labelledby="rr-title">
        <h2 id="rr-title" ref={headingRef} tabIndex={-1} className="view-title">
          Reaction Run: done
        </h2>
        <p className="act-tag">{LOGGED_NOT_SCORED}</p>
        <dl className="act-results">
          <div>
            <dt>Median time</dt>
            <dd className="num">{result.median_ms === null ? '—' : `${result.median_ms} ms`}</dd>
          </div>
          <div>
            <dt>Lapses (over {R.lapseMs} ms)</dt>
            <dd className="num">{result.lapses}</dd>
          </div>
          <div>
            <dt>False starts</dt>
            <dd className="num">{result.false_starts}</dd>
          </div>
          <div>
            <dt>Your usual</dt>
            <dd className="num">{usual ? `${usual.usual_ms} ms` : '—'}</dd>
          </div>
        </dl>
        <p className="muted">
          {usual
            ? `Your usual is the median of your last ${usual.sessions} sessions.`
            : `Your usual appears after ${R.baselineMinSessions} sessions.`}{' '}
          {result.trials} shapes shown.
        </p>
        {saveError && (
          <p className="field__error" role="alert">
            {saveError}
          </p>
        )}
        <div className="act-actions">
          <button type="button" className="btn act-btn" onClick={onExit}>
            Back to activities
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card card--lg act-screen" aria-labelledby="rr-title">
      <div className="act-screen__head">
        <h2 id="rr-title" ref={headingRef} tabIndex={-1} className="view-title">
          Reaction Run
        </h2>
        <button type="button" className="link-btn act-leave" onClick={askLeave}>
          Leave
        </button>
      </div>
      {phase === 'ready' ? (
        <>
          <p>Tap the area, or press Space, as soon as the shape with “TAP” appears. It takes 3 minutes.</p>
          <p className="muted">Tapping before the shape is a false start. A reaction over {R.lapseMs} ms is a lapse. {LOGGED_NOT_SCORED}.</p>
          {gate !== 'open' && (
            <p className="act-gate" role="status">
              {GATE_TEXT[gate]}
            </p>
          )}
          <div className="act-actions">
            <button type="button" className="btn act-btn btn--lg" onClick={start} disabled={gate !== 'open'}>
              Start
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="act-timer" aria-live="off">
            <span className="num">{phase === 'countdown' ? clock(R.sessionMs) : clock(left)}</span> left
          </p>
          <button
            ref={areaRef}
            type="button"
            className={`rr-area${phase === 'stimulus' ? ' is-on' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              respond();
            }}
            aria-label={phase === 'stimulus' ? 'TAP now' : 'Tap area. Wait for the shape.'}
          >
            {phase === 'countdown' && (
              <span className="rr-count num" aria-live="assertive">
                {count}
              </span>
            )}
            {phase === 'wait' && <span className="rr-wait">Wait…</span>}
            {phase === 'stimulus' && (
              <span className="rr-shape" aria-hidden="true">
                TAP
              </span>
            )}
          </button>
          <p className="act-note" role="status">
            {note}
          </p>
        </>
      )}
      {confirming && <LeaveConfirm onLeave={onExit} onStay={resume} />}
    </section>
  );
}
