'use client';

import { useEffect, useRef, useState } from 'react';
import { AFTER_BREATHING_STEP, COLLAPSE_STEPS, COLLAPSE_TOTAL, CPR_STEPS, EVENT_LABELS, cprStepIndex, notesFor } from '../content/emergency.js';
import { BEAT_PER_MINUTE, SWAP_EVERY_MS } from '../lib/emergency.js';
import StepSource from './StepSource.jsx';

const BEAT_MS = 60_000 / BEAT_PER_MINUTE; // 110 a minute ≈ 545 ms

/** "about 20 min" from "about 20 min one-way (approximate …)". */
const shortDelay = (text) => text.replace(/ one-way.*$/, '').replace(/ \(.*\)$/, '');

/** "A message takes about 20 min to reach Earth." for a 'delay' step (Flow 1 and the CPR screen). */
export function DelayLine({ profile }) {
  return (
    <p className="emg-status">
      A message takes {shortDelay(profile.delayText)} to reach Earth. <span className="emg-muted">({profile.label}: {profile.delayText})</span>
    </p>
  );
}

/** true when the person asked for reduced motion. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/** Keep the screen awake while mounted (Wake Lock API); ignored quietly where it is not available. */
function useWakeLock() {
  useEffect(() => {
    let lock = null;
    let done = false;
    const request = async () => {
      try {
        if (!done && document.visibilityState === 'visible' && navigator.wakeLock?.request) lock = await navigator.wakeLock.request('screen');
      } catch {
        // not allowed or not supported: carry on
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') request();
    };
    request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', onVisibility);
      lock?.release?.().catch(() => {});
    };
  }, []);
}

/** One short click on the beat. */
function click(ctx) {
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  } catch {
    // audio unavailable: the beat is still on screen
  }
}

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * CPR screen: compression beat at 110 a minute (pulse, or a large 1–30 count with reduced motion),
 * optional click sound, a 2-minute swap timer, steps 4–10 one at a time, and the big event buttons.
 */
export default function CprScreen({ em, act, audioRef, profile, onEnd }) {
  useWakeLock();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [beat, setBeat] = useState(0);
  const [sound, setSound] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const last = (types) => [...em.events].reverse().find((e) => types.includes(e.type));
  const running = last(['compressions_started', 'stopped', 'breathing_normally'])?.type === 'compressions_started';
  const swapFrom = last(['swap', 'compressions_started']);
  const swapLeft = swapFrom ? SWAP_EVERY_MS - (now - Date.parse(swapFrom.at)) : SWAP_EVERY_MS;
  const swapDue = running && swapLeft <= 0;

  // The beat: scheduled from a fixed start so it does not drift.
  useEffect(() => {
    if (!running) return undefined;
    const t0 = performance.now();
    let n = 0;
    let timer = null;
    const tick = () => {
      n += 1;
      setBeat(n);
      if (soundRef.current && audioRef.current) click(audioRef.current);
      timer = setTimeout(tick, Math.max(0, t0 + n * BEAT_MS - performance.now()));
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [running, audioRef]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  function toggleSound() {
    if (!sound) {
      // A tap is a user gesture: start or resume audio here if it is not running yet.
      try {
        audioRef.current ??= new (window.AudioContext || window.webkitAudioContext)();
        audioRef.current.resume?.();
      } catch {
        // no audio
      }
    }
    setSound(!sound);
  }

  const count = ((beat - 1) % 30) + 1;
  const s = CPR_STEPS[step];
  const logged = (type) => em.events.filter((e) => e.type === type);
  const timeOf = (e) => new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="emg-cpr">
      <div className="emg-cpr__top">
        <div className={`emg-beat${running ? '' : ' is-stopped'}`} aria-hidden="true">
          {reduced ? (
            <span className="emg-beat__count">{running && beat ? count : '–'}</span>
          ) : (
            <>
              <span key={beat} className="emg-beat__pulse" />
              <span className="emg-beat__small">{running && beat ? count : '–'}</span>
            </>
          )}
        </div>
        <div className="emg-cpr__side">
          <p className="emg-cpr__rate">
            {running ? `Push on the beat: ${BEAT_PER_MINUTE} a minute` : 'Compressions stopped'}
          </p>
          <button type="button" className="emg-btn emg-btn--ghost" onClick={toggleSound} aria-pressed={sound}>
            {sound ? 'Sound on (mute)' : 'Sound off (unmute)'}
          </button>
          <div className={`emg-swap${swapDue ? ' is-due' : ''}`} role="timer" aria-live="off">
            <span className="emg-swap__label">{swapDue ? 'Swap now' : 'Swap in'}</span>
            <span className="emg-swap__time num">{running ? (swapDue ? '0:00' : mmss(swapLeft)) : '–'}</span>
          </div>
          <p className="sr-only" aria-live="assertive">
            {swapDue ? 'Two minutes: swap the person doing compressions now.' : ''}
          </p>
          <button type="button" className="emg-btn emg-btn--amber" onClick={() => act.log('swap')} disabled={!running}>
            Swap done
          </button>
        </div>
      </div>

      <div className="emg-step emg-step--cpr">
        <p className="emg-step__count">
          Step {step + COLLAPSE_STEPS.length + 1} of {COLLAPSE_TOTAL}
          {s.who === 'cmo' && <span className="emg-tag">CMO</span>}
        </p>
        <p className="emg-step__text">{s.text}</p>
        <StepSource source={s.source} />
        {s.action === 'delay' && profile && <DelayLine profile={profile} />}
        {notesFor(s, em.environment).map((n) => (
          <div key={n.id}>
            <p className="emg-note">{n.text}</p>
            <StepSource source={n.source} />
          </div>
        ))}
        <div className="emg-nav">
          <button type="button" className="emg-btn emg-btn--ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
            Back
          </button>
          <button type="button" className="emg-btn emg-btn--ghost" onClick={() => setStep(step + 1)} disabled={step === CPR_STEPS.length - 1}>
            Next
          </button>
        </div>
      </div>

      <div className="emg-actions" role="group" aria-label="Log what happens">
        <button type="button" className="emg-btn emg-btn--big" onClick={() => act.log('aed_arrived')} disabled={logged('aed_arrived').length > 0}>
          {logged('aed_arrived').length ? `AED arrived ✓ ${timeOf(logged('aed_arrived')[0])}` : 'AED arrived'}
        </button>
        <button type="button" className="emg-btn emg-btn--big" onClick={() => act.log('aed_shock')}>
          Shock given{logged('aed_shock').length ? ` (${logged('aed_shock').length})` : ''}
        </button>
        <button type="button" className="emg-btn emg-btn--big" 
          onClick={() => {
            act.log('breathing_normally');
            setStep(cprStepIndex(AFTER_BREATHING_STEP));
          }}
          disabled={!running}
        >
          Breathing normally
        </button>
        {running ? (
          <button type="button" className="emg-btn emg-btn--big emg-btn--stop" onClick={() => act.log('stopped')}>
            Stop
          </button>
        ) : (
          <button type="button" className="emg-btn emg-btn--big emg-btn--red" onClick={() => act.log('compressions_started')}>
            Resume compressions
          </button>
        )}
      </div>
      {!running && (
        <button type="button" className="emg-btn emg-btn--end" onClick={onEnd}>
          End emergency
        </button>
      )}
      <p className="sr-only" aria-live="polite">
        {em.events.length ? `${EVENT_LABELS[em.events.at(-1).type]} logged.` : ''}
      </p>
    </div>
  );
}
