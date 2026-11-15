'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVITY_SETTINGS, DOCK_WHY, DOCK_WHY_SOURCE, GAME_SCALE_LABEL, LOGGED_NOT_SCORED } from '../../content/activities.js';
import { GATE_TEXT } from '../../lib/activities.js';
import {
  LEVELS,
  createRound,
  dockBestToday,
  dockUsual,
  levelOf,
  nextRandom,
  offsetOf,
  precisionScore,
  roundResult,
  speedOf,
  step,
  timeLeft,
  unlockedLevels,
} from '../../lib/dockPilot.js';
import { WhySource } from '../WhyItMatters.jsx';
import LeaveConfirm, { prefersReducedMotion, useEscape } from './LeaveConfirm.jsx';

const D = ACTIVITY_SETTINGS.dock;
const M_PER_PX = 0.1; // display only: the HUD shows game metres (1 px = 0.1 m)
const MAX_DPR = 2; // the canvas backing store follows devicePixelRatio, capped here
const START_W = D.world.w * MAX_DPR; // backing size before the first measure
const MOMENT_MS = 1400; // the "Docked!" / "Time's up" moment before the result card
const COUNTDOWN = 3;
const FINE_POINTER = '(hover: hover) and (pointer: fine)'; // mouse and keyboard: a hint line, the pad on request
const COLORS = {
  space: '#050b1a',
  star: '#e8eefc',
  hull: '#3a465e',
  hullLine: '#5d6a86',
  panel: '#173458',
  ring: '#4cc9f0',
  ringDocked: '#3ddc97', // green only here, inside the canvas, and only once docked
  capture: 'rgba(76, 201, 240, 0.35)',
  guide: 'rgba(76, 201, 240, 0.6)',
  capsule: '#d5dbe6',
  capsuleLine: '#8a94a8',
  window: '#4cc9f0',
  flame: '#ff8c42',
  flameCore: '#ffd166',
};

const KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};
const PAD = [
  { dir: 'up', label: 'Thrust up', glyph: '▲' },
  { dir: 'left', label: 'Thrust left', glyph: '◀' },
  { dir: 'right', label: 'Thrust right', glyph: '▶' },
  { dir: 'down', label: 'Thrust down', glyph: '▼' },
];

const clock = (s) => {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

/** A fixed starfield (seeded, so it is the same every round). */
function makeStars(count = 70) {
  let seed = 2026;
  const r = () => {
    let v;
    [v, seed] = nextRandom(seed);
    return v;
  };
  return Array.from({ length: count }, () => ({ x: r() * D.world.w, y: r() * D.world.h, size: r() < 0.85 ? 1 : 1.8, a: 0.35 + r() * 0.6, speed: 1 + r() * 3 }));
}

const hudOf = (s) => ({
  left: timeLeft(s),
  speed: speedOf(s) * M_PER_PX,
  under: speedOf(s) <= D.dockSpeed,
  dist: offsetOf(s) * M_PER_PX,
  fuel: s.fuel / D.fuelMax,
});

/**
 * Dock Pilot: fly the capsule into the docking ring, gently. Arrow keys or WASD (or the on-screen pad)
 * fire thrusters; there is no friction. A round ends on docking or after 60 s and is saved as soon as it
 * ends. Escape asks before leaving; a hidden tab pauses the round (paused time does not count).
 * @param {{ onSave: (data) => { ok: boolean, error?: string }, onExit: () => void, records: object[], crewId: string, today: string,
 *   gate: 'open'|'rest'|'done' }} props
 */
export default function DockPilot({ onSave, onExit, records, crewId, today, gate }) {
  const unlocked = unlockedLevels(records, crewId, today);
  const [level, setLevel] = useState(() => unlocked.at(-1) ?? 1);
  const [phase, setPhase] = useState('ready'); // ready | countdown | playing | moment | results
  const [count, setCount] = useState(COUNTDOWN);
  const [paused, setPaused] = useState(null); // null | 'hidden' | 'confirm'
  const [hud, setHud] = useState(() => hudOf(createRound({ level: 1 })));
  const [live, setLive] = useState('');
  const [result, setResult] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [newLevel, setNewLevel] = useState(null);
  const [showGo, setShowGo] = useState(false);
  const [padOn, setPadOn] = useState(false); // mouse and keyboard: the on-screen pad only when asked for
  const [fine, setFine] = useState(false); // a fine pointer with hover (set after mount; follows changes)

  const canvasRef = useRef(null);
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const headingRef = useRef(null);
  const resumeRef = useRef(null);
  const stars = useMemo(() => makeStars(), []);
  const g = useRef({ sim: null, keys: new Set(), pad: new Set(), raf: 0, last: 0, acc: 0, timers: [], shakeUntil: 0 });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const reduced = useRef(false);
  const latest = useRef({});

  const running = phase === 'countdown' || phase === 'playing';
  const L = levelOf(level);

  const later = (fn, ms) => g.current.timers.push(setTimeout(fn, ms));
  const clearTimers = () => {
    g.current.timers.forEach(clearTimeout);
    g.current.timers = [];
  };
  const clearInput = () => {
    g.current.keys.clear();
    g.current.pad.clear();
  };

  useEffect(() => {
    reduced.current = prefersReducedMotion();
    headingRef.current?.focus();
    const st = g.current;
    return () => {
      cancelAnimationFrame(st.raf);
      st.timers.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia?.(FINE_POINTER);
    if (!mq) return undefined;
    const on = () => setFine(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  // If the player's level is locked (a different person, or a new day), fall back to the highest open one.
  useEffect(() => {
    if (!unlocked.includes(level)) setLevel(unlocked.at(-1) ?? 1);
  }, [unlocked.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Drawing ----------

  function draw(now = performance.now()) {
    const c = canvasRef.current;
    const ctx = c?.getContext?.('2d');
    if (!ctx) return;
    const st = g.current;
    const sim = st.sim && phaseRef.current !== 'ready' ? st.sim : createRound({ level, seed: 1 });
    const lv = levelOf(sim.level);
    const rm = reduced.current;
    const { w, h } = D.world;
    const k = c.width / w; // logical 480 × 320, whatever the backing size
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (!rm && now < st.shakeUntil) ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);

    ctx.fillStyle = COLORS.space;
    ctx.fillRect(-10, -10, w + 20, h + 20);
    // Stars: drift slowly left; still with reduced motion.
    const t = rm ? 0 : now / 1000;
    ctx.fillStyle = COLORS.star;
    for (const s of stars) {
      ctx.globalAlpha = s.a;
      const x = (((s.x - t * s.speed) % w) + w) % w;
      ctx.fillRect(x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    // The station: a module on the right edge, two panels, a collar to the port.
    const px = D.port.x;
    const py = D.port.y;
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = 'rgba(76, 201, 240, 0.3)';
    ctx.lineWidth = 1;
    for (const [y0, y1] of [
      [18, 82],
      [238, 302],
    ]) {
      ctx.fillRect(448, y0, 26, y1 - y0);
      ctx.beginPath();
      for (let y = y0 + 8; y < y1; y += 8) {
        ctx.moveTo(448, y);
        ctx.lineTo(474, y);
      }
      ctx.moveTo(461, y0);
      ctx.lineTo(461, y1);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.hullLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(461, 82);
    ctx.lineTo(461, 238);
    ctx.stroke();
    ctx.fillStyle = COLORS.hull;
    ctx.fillRect(442, 100, 38, 120);
    ctx.strokeRect(442, 100, 38, 120);
    ctx.fillRect(px + lv.ringR - 2, py - 12, 442 - (px + lv.ringR - 2), 24);

    // The ring (sky blue; green only once docked) and the capture zone.
    ctx.lineWidth = 4;
    ctx.strokeStyle = sim.docked ? COLORS.ringDocked : COLORS.ring;
    ctx.beginPath();
    ctx.arc(px, py, lv.ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = sim.docked ? COLORS.ringDocked : COLORS.capture;
    ctx.beginPath();
    ctx.arc(px, py, lv.captureR, 0, Math.PI * 2);
    ctx.stroke();

    // Level 1 approach guide: a dotted line from the capsule to the port.
    if (lv.guide && !sim.over && phaseRef.current !== 'ready') {
      ctx.strokeStyle = COLORS.guide;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(sim.x, sim.y);
      ctx.lineTo(px, py);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // The capsule, nose to the right, with a flame opposite each thruster that is firing.
    ctx.save();
    ctx.translate(sim.x, sim.y);
    const flame = (x, y, dx, dy) => {
      const len = 9 + (rm ? 2 : Math.random() * 5);
      const nx = -dy;
      const ny = dx;
      ctx.fillStyle = COLORS.flame;
      ctx.beginPath();
      ctx.moveTo(x + nx * 4, y + ny * 4);
      ctx.lineTo(x - nx * 4, y - ny * 4);
      ctx.lineTo(x + dx * len, y + dy * len);
      ctx.fill();
      ctx.fillStyle = COLORS.flameCore;
      ctx.beginPath();
      ctx.moveTo(x + nx * 2, y + ny * 2);
      ctx.lineTo(x - nx * 2, y - ny * 2);
      ctx.lineTo(x + dx * len * 0.55, y + dy * len * 0.55);
      ctx.fill();
    };
    const th = sim.thrusting ?? { x: 0, y: 0 };
    if (th.x > 0) flame(-11, 0, -1, 0);
    if (th.x < 0) flame(11, 0, 1, 0);
    if (th.y > 0) flame(0, -9, 0, -1);
    if (th.y < 0) flame(0, 9, 0, 1);
    ctx.fillStyle = COLORS.capsule;
    ctx.strokeStyle = COLORS.capsuleLine;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.lineTo(4, -8);
    ctx.quadraticCurveTo(11, -6, 11, 0);
    ctx.quadraticCurveTo(11, 6, 4, 8);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.capsuleLine;
    ctx.fillRect(11, -2, 3, 4); // docking probe
    ctx.fillStyle = COLORS.window;
    ctx.beginPath();
    ctx.arc(2, -1, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  latest.current.draw = draw;

  // A still frame whenever the screen changes (the loop draws while playing).
  useEffect(() => {
    latest.current.draw();
  }, [phase, paused, level]);

  // Fit the window: the backing store follows the canvas's CSS size × devicePixelRatio (capped at 2), and
  // while a round is on screen the height of everything around the canvas (header, HUD, status line,
  // controls) is measured into --dock-chrome, which the CSS takes off 100dvh to size the canvas.
  const hasCanvas = phase !== 'results';
  useEffect(() => {
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!hasCanvas || !canvas || !section || !stage) return undefined;
    const fit = () => {
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const bw = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const bh = Math.max(1, Math.round((bw * D.world.h) / D.world.w));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      if (phaseRef.current === 'ready') section.style.removeProperty('--dock-chrome');
      else {
        const chrome = `${Math.ceil(section.offsetHeight - stage.offsetHeight)}px`;
        if (section.style.getPropertyValue('--dock-chrome') !== chrome) section.style.setProperty('--dock-chrome', chrome);
      }
      latest.current.draw();
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    ro.observe(section);
    return () => ro.disconnect();
  }, [hasCanvas]);

  // ---------- The loop ----------

  const input = () => {
    const held = new Set([...g.current.keys, ...g.current.pad]);
    return { x: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0), y: (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0) };
  };

  function announce(events) {
    if (events.includes('hard_contact')) {
      setLive('Hard contact. Slow down before the ring.');
      if (!reduced.current) g.current.shakeUntil = performance.now() + 250;
    } else if (events.includes('out_of_fuel')) setLive('Out of fuel. The capsule keeps drifting.');
  }

  function endRound() {
    const st = g.current;
    clearInput();
    const res = roundResult(st.sim);
    const saved = onSave(res);
    setSaveError(saved.ok ? null : saved.error);
    setResult(res);
    setNewLevel(res.docked && saved.ok && level < LEVELS.at(-1) && !unlocked.includes(level + 1) ? level + 1 : null);
    setHud(hudOf(st.sim));
    setLive(res.docked ? `Docked in ${Math.round(res.time_s)} seconds` : 'Time’s up. Not docked this round.');
    setPhase('moment');
    later(() => setPhase('results'), MOMENT_MS);
  }

  function frame(now) {
    const st = g.current;
    if (phaseRef.current !== 'playing' || pausedRef.current) return;
    st.acc += Math.min(0.1, (now - st.last) / 1000); // a long frame never jumps more than 0.1 s
    st.last = now;
    while (st.acc >= D.stepS && !st.sim.over) {
      st.sim = step(st.sim, input());
      st.acc -= D.stepS;
      if (st.sim.events.length) announce(st.sim.events);
    }
    draw(now);
    if (now - (st.hudAt ?? 0) > 100) {
      setHud(hudOf(st.sim));
      st.hudAt = now;
    }
    if (st.sim.over) return endRound();
    st.raf = requestAnimationFrame((t) => latest.current.frame(t));
  }
  latest.current.frame = frame;

  // Run the loop only while playing and not paused; paused time is never counted.
  useEffect(() => {
    if (phase !== 'playing' || paused) return undefined;
    const st = g.current;
    st.last = performance.now();
    st.acc = 0;
    st.raf = requestAnimationFrame((t) => latest.current.frame(t));
    return () => cancelAnimationFrame(st.raf);
  }, [phase, paused]);

  // ---------- Starting, pausing, leaving ----------

  function countdown(c) {
    setCount(c);
    if (c > 0) {
      setLive(String(c));
      later(() => countdown(c - 1), 1000);
    } else {
      setLive('Go!');
      setShowGo(true);
      later(() => setShowGo(false), 700);
      setPhase('playing');
    }
  }

  function start() {
    if (gate !== 'open') return;
    clearTimers();
    clearInput();
    const st = g.current;
    st.sim = createRound({ level, seed: (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0 });
    st.shakeUntil = 0;
    setResult(null);
    setSaveError(null);
    setNewLevel(null);
    setPaused(null);
    setHud(hudOf(st.sim));
    setPhase('countdown');
    countdown(COUNTDOWN);
    // Bring the game to the top of the window once the game layout is on screen.
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ block: 'start', behavior: reduced.current ? 'auto' : 'smooth' });
      canvasRef.current?.focus({ preventScroll: true });
    });
  }

  function pause(kind) {
    clearTimers(); // a countdown starts again on resume
    clearInput();
    setShowGo(false);
    setPaused(kind);
  }

  function resume() {
    setPaused(null);
    setLive('');
    if (phaseRef.current === 'countdown') countdown(COUNTDOWN);
    requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }));
  }
  latest.current.resume = resume;
  latest.current.pause = pause;

  function askLeave() {
    if (phaseRef.current === 'countdown' || phaseRef.current === 'playing') return pause('confirm');
    onExit(); // ready, the saved round's moment, or the result card
  }
  useEscape(askLeave, paused !== 'confirm');

  // The tab is hidden: pause. A lost window focus lets go of every key, so no thruster sticks.
  useEffect(() => {
    const onVisibility = () => {
      const p = phaseRef.current;
      if (document.hidden && (p === 'countdown' || p === 'playing') && !pausedRef.current) {
        latest.current.pause('hidden');
        setLive('Paused');
      }
    };
    const onBlur = () => clearInput();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Thruster keys while a round runs. Arrow keys, WASD and Space never scroll the page then.
  useEffect(() => {
    const isRunning = () => phaseRef.current === 'countdown' || phaseRef.current === 'playing';
    const onDown = (e) => {
      if (!isRunning() || pausedRef.current === 'confirm' || e.key === 'Escape') return;
      if (pausedRef.current === 'hidden') {
        if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
        e.preventDefault();
        latest.current.resume();
        return;
      }
      const dir = KEYS[e.code] ?? KEYS[e.key];
      if (dir || e.code === 'Space' || e.key === ' ') e.preventDefault();
      if (dir) g.current.keys.add(dir);
    };
    const onUp = (e) => {
      const dir = KEYS[e.code] ?? KEYS[e.key];
      if (dir) g.current.keys.delete(dir);
      if (isRunning() && (dir || e.code === 'Space')) e.preventDefault();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useEffect(() => {
    if (paused === 'hidden') resumeRef.current?.focus();
  }, [paused]);
  useEffect(() => {
    if (phase === 'results') headingRef.current?.focus();
  }, [phase]);

  // On-screen pad: hold to fire (pointer), or hold Enter / Space on a focused button.
  const padHandlers = (dir) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (running && !paused) g.current.pad.add(dir);
    },
    onPointerUp: () => g.current.pad.delete(dir),
    onPointerCancel: () => g.current.pad.delete(dir),
    onLostPointerCapture: () => g.current.pad.delete(dir),
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (running && !paused) g.current.pad.add(dir);
      }
    },
    onKeyUp: (e) => {
      if (e.key === 'Enter' || e.key === ' ') g.current.pad.delete(dir);
    },
    onContextMenu: (e) => e.preventDefault(),
  });

  // ---------- Result card ----------

  if (phase === 'results' && result) {
    const precision = precisionScore(result);
    const usual = dockUsual(records, crewId, today, result.level);
    const best = dockBestToday(records, crewId, today, result.level);
    return (
      <section className="card card--lg act-screen" aria-labelledby="dp-title">
        <h2 id="dp-title" ref={headingRef} tabIndex={-1} className="view-title">
          Dock Pilot: {result.docked ? 'docked' : 'not docked'}
        </h2>
        <p className="act-tag">{LOGGED_NOT_SCORED}</p>
        <dl className="act-results">
          <div>
            <dt>Precision</dt>
            <dd className="num">
              {precision}
              <span className="dock-of"> / 100</span>
            </dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd className="num">{result.docked ? `${Math.round(result.time_s)} s` : 'Not docked'}</dd>
          </div>
          <div>
            <dt>Hard contacts</dt>
            <dd className="num">{result.hard_contacts}</dd>
          </div>
          <div>
            <dt>Your usual (level {result.level})</dt>
            <dd className="num">{usual ? usual.usual : '—'}</dd>
          </div>
          <div>
            <dt>Best today (level {result.level})</dt>
            <dd className="num">{best ?? '—'}</dd>
          </div>
        </dl>
        <p className="muted">
          Precision is a game number ({GAME_SCALE_LABEL}), from how close, how slow and how sparing with fuel you were. It is not a health measure.{' '}
          {usual
            ? `Your usual is the median of your last ${usual.rounds} rounds at this level.`
            : `Your usual appears after ${D.baselineMinRounds} rounds at this level.`}
        </p>
        {newLevel && <p className="act-done">Level {newLevel} is now open.</p>}
        <div className="dock-why">
          <p className="dock-why__text">
            <strong>Why it helps:</strong> {DOCK_WHY}
          </p>
          <WhySource source={DOCK_WHY_SOURCE} />
        </div>
        {saveError && (
          <p className="field__error" role="alert">
            {saveError}
          </p>
        )}
        {gate !== 'open' && (
          <p className="act-gate" role="status">
            {GATE_TEXT[gate]}
          </p>
        )}
        <div className="act-actions">
          <button type="button" className="btn act-btn" onClick={start} disabled={gate !== 'open'}>
            Play again
          </button>
          <button type="button" className="btn btn--secondary" onClick={onExit}>
            Back to activities
          </button>
        </div>
      </section>
    );
  }

  // ---------- Level picker and the game ----------

  const padShown = phase === 'countdown' || phase === 'playing' || phase === 'moment'; // kept through the moment: no jump
  const padVisible = padShown && (!fine || padOn); // touch: always; mouse and keyboard: when switched on
  return (
    <section ref={sectionRef} className={`card card--lg act-screen dock-screen${padOn ? ' is-pad-on' : ''}`} aria-labelledby="dp-title">
      <div className="act-screen__head">
        <h2 id="dp-title" ref={headingRef} tabIndex={-1} className="view-title">
          Dock Pilot
        </h2>
        <button type="button" className="link-btn act-leave" onClick={askLeave}>
          Leave
        </button>
      </div>

      {phase === 'ready' && (
        <>
          <p>
            Fly the capsule into the docking ring, gently. Arrow keys or W A S D fire the thrusters; on a touch screen, hold the pad below. There is no
            friction, as in orbit: fire the other way to slow down. Dock under {(D.dockSpeed * M_PER_PX).toFixed(1)} m/s. A round lasts up to 1 minute.
          </p>
          <fieldset className="field dock-levels">
            <legend className="field__label">Level</legend>
            <div className="segmented act-segmented">
              {LEVELS.map((lv) => {
                const open = unlocked.includes(lv);
                return (
                  <label key={lv} className="segmented__option">
                    <input
                      type="radio"
                      name="dp-level"
                      value={lv}
                      className="visually-hidden-input"
                      checked={level === lv}
                      disabled={!open}
                      onChange={() => setLevel(lv)}
                      aria-describedby={open ? undefined : `dp-lock-${lv}`}
                    />
                    <span className="segmented__face">
                      Level {lv}
                      {!open && (
                        <span id={`dp-lock-${lv}`} className="dock-lock">
                          {' '}
                          · locked
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="muted dock-levels__hint">
              {level === 1 && 'Level 1: no drift, with an approach guide. '}
              {level === 2 && 'Level 2: the capsule drifts slowly. '}
              {level === 3 && 'Level 3: drift, solar-wind nudges and a smaller ring. '}
              Dock once to open the next level.
            </p>
          </fieldset>
          <p className="muted">{LOGGED_NOT_SCORED}. Up to 3 rounds a day.</p>
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
      )}

      {/* The HUD, status line, canvas and hint share one centred column as wide as the canvas. On wide
          screens a visible pad sits to the right of the canvas; otherwise below it. */}
      <div className={`dock-play${padVisible ? ' has-pad' : ''}`}>
        {phase !== 'ready' && (
          <div className="dock-hud" aria-hidden="true">
            <span>
              Level <b className="num">{level}</b>
            </span>
            <span>
              <b className="num">{clock(hud.left)}</b> left
            </span>
            <span>
              Speed <b className={`num${L.guide && hud.under ? ' dock-under' : ''}`}>{hud.speed.toFixed(1)}</b> m/s
            </span>
            <span>
              Distance <b className="num">{hud.dist.toFixed(1)}</b> m
            </span>
            <span className="dock-fuel">
              Fuel
              <span className="dock-fuel__bar">
                <span className="dock-fuel__fill" style={{ width: `${Math.round(hud.fuel * 100)}%` }} />
              </span>
              <b className="num">{Math.round(hud.fuel * 100)}%</b>
            </span>
          </div>
        )}

        {/* One status line, always mounted (so every change is announced), between the HUD and the canvas. */}
        <p className={`act-note dock-live${phase === 'ready' ? ' is-idle' : ''}`} aria-live="polite">
          {live}
        </p>

        <div ref={stageRef} className={`dock-stage${phase === 'ready' ? ' is-preview' : ''}`}>
          <canvas
            ref={canvasRef}
            className="dock-canvas"
            width={START_W}
            height={(START_W * D.world.h) / D.world.w}
            tabIndex={phase === 'ready' ? -1 : 0}
            role="img"
            aria-label={`Docking view, level ${level}. The capsule starts on the left; the docking ring is on the right. Use the arrow keys or W A S D to fire thrusters.`}
          />
          {phase === 'countdown' && !paused && (
            <span className="dock-overlay dock-count num" aria-hidden="true">
              {count > 0 ? count : 'Go'}
            </span>
          )}
          {phase === 'playing' && showGo && !paused && (
            <span className="dock-overlay dock-count num" aria-hidden="true">
              Go
            </span>
          )}
          {phase === 'moment' && result && (
            <span className={`dock-overlay dock-moment${result.docked ? ' is-docked' : ''}`} aria-hidden="true">
              {result.docked ? 'Docked!' : 'Time’s up'}
            </span>
          )}
          {paused === 'hidden' && (
            <button ref={resumeRef} type="button" className="dock-overlay dock-paused" onClick={resume}>
              Paused · press any key or tap to continue
            </button>
          )}
        </div>

        {fine && (
          <div className="dock-controls">
            <p className="dock-controls__hint">Steer with the arrow keys or WASD · Esc to pause</p>
            <button type="button" className="link-btn dock-pad-toggle" onClick={() => setPadOn((v) => !v)}>
              {padOn ? 'Hide on-screen controls' : 'Show on-screen controls'}
            </button>
          </div>
        )}

        {padVisible && (
          <div className="dock-pad" role="group" aria-label="Thrusters">
            {PAD.map((p) => (
              <button key={p.dir} type="button" className={`dock-pad__btn dock-pad__btn--${p.dir}`} aria-label={p.label} {...padHandlers(p.dir)}>
                <span aria-hidden="true">{p.glyph}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {phase === 'ready' && (
        <div className="dock-why">
          <p className="dock-why__text">
            <strong>Why it helps:</strong> {DOCK_WHY}
          </p>
          <WhySource source={DOCK_WHY_SOURCE} />
        </div>
      )}

      {paused === 'confirm' && <LeaveConfirm title="Leave this round? It won’t be saved." onLeave={onExit} onStay={resume} />}
    </section>
  );
}
