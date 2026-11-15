import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { cadence, chartGeometry, groupByUnit, number, utc } from './model.js';
import { DeliveryPanel } from './DeliveryPanel.jsx';
import './style.css';

const TITLES = { cumulative_absorbed_radiation_dose: 'Cumulative radiation', muscle: 'Muscle strength & mass' };
const METRIC_LABELS = { systolic: 'Systolic', diastolic: 'Diastolic', grip_strength: 'Grip force', muscle_mass: 'Muscle mass' };
const COLORS = ['#387d63', '#bd744e'];
const SLIDERS = [
  { name: 'activity', label: 'Activity', min: 0, max: 1, step: .05, suffix: '', ends: ['At rest', 'High intensity'] },
  { name: 'stress', label: 'Stress', min: 0, max: 1, step: .05, suffix: '', ends: ['Low load', 'High load'] },
  { name: 'sleep_restriction_hours', label: 'Sleep restriction', min: 0, max: 8, step: .5, suffix: ' h', ends: ['Full opportunity', 'Restricted'] },
  { name: 'radiation_multiplier', label: 'Radiation intensity', min: 0, max: 10, step: .5, suffix: '×', ends: ['No accumulation', '10× base rate'] },
];

async function request(path, body, signal) {
  const response = await fetch(path, { signal, cache: 'no-store', credentials: 'omit',
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Simulation-Lab': '1' }, body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || 'Python API unavailable. Start python -m simulation.api in the repository root.');
  return data;
}

function Orbit({ small = false }) {
  return <svg className={small ? 'orbit small' : 'orbit'} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <circle cx="24" cy="24" r="12" stroke="currentColor" strokeWidth="1.5" />
    <ellipse cx="24" cy="24" rx="22" ry="8" transform="rotate(-38 24 24)" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="38" cy="10" r="3.5" fill="currentColor" />
  </svg>;
}

function Plot({ series, unit }) {
  const geometry = chartGeometry(series);
  if (!geometry) return <div className="plot-empty"><span className="empty-orbit">◌</span><span>No measurements yet</span></div>;
  return <div className="plot-wrap">
    <svg viewBox="0 0 480 140" role="img" aria-label={`Synthetic trend in ${unit}; measured points with original and context references`}>
      {[20, 65, 110].map(y => <line key={y} x1="10" x2="470" y1={y} y2={y} stroke="#e7ebe2" />)}
      {series.map((metric, index) => <g key={metric.code}>
        <path d={geometry.path(metric.points, 'original')} className="baseline-original" />
        <path d={geometry.path(metric.points, 'activity')} className="baseline-context" />
        <path d={geometry.path(metric.points, 'value')} fill="none" stroke={COLORS[index]} strokeWidth="2" />
        {metric.points.filter((_, i) => metric.points.length < 20 || i === metric.points.length - 1).map(point =>
          <circle key={point.at} cx={geometry.x(point.at)} cy={geometry.y(point.value)} r="3" fill={COLORS[index]}>
            <title>{utc(point.at)} UTC · {number(point.value, unit)} {unit} · {point.context} · synthetic</title>
          </circle>)}
      </g>)}
    </svg>
    <div className="plot-axis"><span>{utc(geometry.first, true)}</span><span>{utc(geometry.last, true)} UTC</span></div>
  </div>;
}

function SignalCard({ family, data, index }) {
  const metrics = data?.metrics || family.metrics.map(metric => ({ ...metric, points: [], latest: null, sample_count: 0 }));
  const latest = metrics.find(metric => metric.latest)?.latest;
  const count = Math.max(...metrics.map(metric => metric.sample_count), 0);
  const groups = groupByUnit(metrics);
  return <article className="signal-card" data-testid={`family-${family.code}`}>
    <div className="signal-heading"><span className="signal-number">{String(index + 1).padStart(2, '0')}</span>
      <h3>{TITLES[family.code] || family.name}</h3><span className="synthetic-tag">Synthetic</span></div>
    <div className={`readings ${metrics.length > 1 ? 'compound' : ''}`}>
      {metrics.map(metric => <div key={metric.code}>
        {metrics.length > 1 && <span className="metric-label">{METRIC_LABELS[metric.code] || metric.code}</span>}
        <strong data-testid={`reading-${family.code}-${metric.code}`}>{number(metric.latest?.value, metric.unit)}</strong>
        <span className="unit">{metric.unit}</span>
      </div>)}
    </div>
    <div className="measurement-note"><span className={count ? 'sample-dot' : 'sample-dot awaiting'} />
      {latest ? `Measured ${utc(latest.at, true)} UTC` : `First sample after ${cadence(family.cadence_minutes)}`}
      <span>{latest?.context || 'Awaiting sample'}</span></div>
    <div className={`plots ${groups.length > 1 ? 'multiple' : ''}`}>
      {groups.map(group => <div key={group.unit}>{groups.length > 1 && <span className="plot-unit">{group.unit}</span>}
        <Plot {...group} /></div>)}
    </div>
    <div className="reference-rows">
      {metrics.map(metric => <div className="reference-row" key={metric.code}>
        {metrics.length > 1 && <span>{METRIC_LABELS[metric.code]}</span>}
        <span><i className="original-swatch" />Original <b>{number(metric.original_reference, metric.unit)}</b></span>
        <span><i className="context-swatch" />Context <b>{number(metric.context_reference, metric.unit)}</b></span>
      </div>)}
    </div>
    <div className="card-foot"><span>Every {cadence(family.cadence_minutes)}</span><span>{count} {count === 1 ? 'sample' : 'samples'}</span></div>
  </article>;
}

function App() {
  const [catalog, setCatalog] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [profile, setProfile] = useState('');
  const [run, setRun] = useState('');
  const [draft, setDraft] = useState(null);
  const [seed, setSeed] = useState(42);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const mutating = useRef(false), epoch = useRef(0), hydrated = useRef(false);

  useEffect(() => {
    let active = true, timeout;
    const controller = new AbortController();
    async function poll() {
      const version = epoch.current;
      try {
        const available = catalog || await request('/api/catalog', undefined, controller.signal);
        if (!active) return;
        if (!catalog) setCatalog(available);
        const id = profile || available.profiles[0].astronaut_id;
        const query = new URLSearchParams({ astronaut_id: id, ...(run ? { run_id: run } : {}) });
        const state = await request(`/api/state?${query}`, undefined, controller.signal);
        if (!active || version !== epoch.current || mutating.current) return;
        setSnapshot(state); setConnected(true);
        if (!hydrated.current) { setDraft(state.settings); setSeed(state.settings.seed); hydrated.current = true; }
      } catch (failure) {
        if (active && failure.name !== 'AbortError') { setConnected(false); setError(failure.message); }
      } finally {
        if (active) timeout = setTimeout(poll, 650);
      }
    }
    poll();
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [profile, run, catalog]);

  async function command(action, fields = {}) {
    if (mutating.current) return;
    mutating.current = true; epoch.current += 1; setBusy(true); setError('');
    try {
      const query = new URLSearchParams({ astronaut_id: profile || catalog.profiles[0].astronaut_id });
      const state = await request(`/api/${action}?${query}`, { expected_run_id: snapshot.run_id, ...fields });
      setSnapshot(state); setRun(state.run_id); setDraft(state.settings); setConnected(true);
    } catch (failure) { setError(failure.message); }
    finally { mutating.current = false; setBusy(false); }
  }

  const activeProfile = catalog?.profiles.find(person => person.astronaut_id === (profile || catalog.profiles[0].astronaut_id));
  const state = snapshot?.state || 'READY';
  const historical = snapshot?.historical || false;
  const disabled = busy || !connected || historical;
  const settings = snapshot?.settings;
  const dirty = draft && settings && [...SLIDERS.map(slider => slider.name), 'time_scale'].some(key => draft[key] !== settings[key]);
  const currentPreset = catalog?.presets.find(preset => preset.id === settings?.scenario);
  const viewSnapshot = snapshot?.astronaut_id === activeProfile?.astronaut_id
    && (!run || snapshot.selected_run_id === run) ? snapshot : null;

  return <div className="lab-shell">
    <header className="topbar"><div className="brand"><Orbit small /><span>AstroHealth</span><i /> <span className="brand-area">Simulation lab</span></div>
      <div className="environment"><span className={`connection-dot ${connected ? 'on' : ''}`} /><span>{connected ? 'Python engine connected' : 'Python API offline'}</span><span className="local-tag">LOCAL ONLY</span></div></header>
    <main>
      <div className="page-intro"><div><p className="eyebrow">DEVELOPMENT WORKSPACE <span>/</span> PHASE 4</p>
        <h1>Simulation lab<span>.</span></h1><p className="intro-copy">Explore a synthetic mission. Observe how individual signals change together.</p></div>
        <div className="synthetic-notice"><span>◈</span><div><strong>Entirely synthetic.</strong><p>A demonstration, not clinical guidance<br />or trained ML inference.</p></div></div></div>
      {error && <div className={`notice ${connected ? '' : 'offline'}`} role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss message">×</button></div>}
      {snapshot?.notice && <div className="notice" role="status">{snapshot.notice}</div>}
      <DeliveryPanel />
      <div className="workspace">
        <aside className="control-panel">
          <div className="panel-title"><span className="eyebrow">MISSION CONTROLS</span><span className="tiny-index">01—09</span></div>
          <label className="field-label" htmlFor="astronaut">Fictional astronaut</label>
          <select id="astronaut" value={profile || activeProfile?.astronaut_id || ''} onChange={event => setProfile(event.target.value)} disabled={!catalog || busy}>
            {!catalog && <option>Waiting for Python API…</option>}
            {catalog?.profiles.map(person => <option key={person.astronaut_id} value={person.astronaut_id}>{person.name}</option>)}
          </select>
          <div className="subject-caption">{activeProfile?.crew_code || 'No profile loaded'} <span>Fictional profile</span></div>
          <div className="section-label"><span>Scenario preset</span><span>PYTHON</span></div>
          <div className="presets">{catalog?.presets.map((preset, index) => <button key={preset.id} disabled={disabled}
            className={settings?.scenario === preset.id ? 'preset selected' : 'preset'}
            aria-pressed={settings?.scenario === preset.id}
            onClick={() => command('controls', { scenario: preset.id, ...preset.controls })}>
            <span className="preset-index">0{index + 1}</span><span>{preset.label}</span><span className="preset-mark">↗</span></button>)}</div>
          <p className="preset-description">{currentPreset?.description || 'Connect the local engine to choose a scenario.'}</p>
          <div className="divider" />
          <div className="section-label"><span>Experiment parameters</span>{dirty && <span className="draft-tag">UNAPPLIED</span>}</div>
          {SLIDERS.map(slider => <div className="slider-field" key={slider.name}>
            <label htmlFor={slider.name}>{slider.label}<output htmlFor={slider.name}>{number(draft?.[slider.name], 'control')}{slider.suffix}</output></label>
            <input id={slider.name} aria-label={slider.label} type="range" min={slider.min} max={slider.max} step={slider.step} value={draft?.[slider.name] ?? slider.min}
              disabled={disabled || !draft} onChange={event => setDraft({ ...draft, [slider.name]: Number(event.target.value) })} />
            <div className="range-ends"><span>{slider.ends[0]}</span><span>{slider.ends[1]}</span></div>
          </div>)}
          <label className="field-label acceleration-label" htmlFor="acceleration">Time acceleration</label>
          <select id="acceleration" value={draft?.time_scale || 86400} disabled={disabled || !draft}
            onChange={event => setDraft({ ...draft, time_scale: Number(event.target.value) })}>
            <option value={3600}>1 hour / second</option><option value={86400}>1 day / second</option><option value={604800}>7 days / second</option>
          </select>
          <p className="field-hint">One virtual clock. Each indicator keeps its own cadence.</p>
          <button className="apply-button" disabled={disabled || !dirty} onClick={() => command('controls', Object.fromEntries(
            [...SLIDERS.map(slider => slider.name), 'time_scale'].map(key => [key, draft[key]])))}>Apply parameters <span>↗</span></button>
          <div className="divider" /><label className="field-label" htmlFor="seed">Replay seed</label>
          <input id="seed" className="seed-input" type="number" step="1" value={seed} disabled={disabled} onChange={event => setSeed(event.target.value)} />
          <p className="field-hint">Applied on reset. Earlier observations stay in this local workspace.</p>
        </aside>
        <section className="results-area" aria-label="Simulation readings">
          <div className="run-panel">
            <div className="run-panel-top"><div className="run-heading"><span className={`state-badge ${state.toLowerCase()}`} data-testid="simulation-status"><i />{connected ? state : 'DISCONNECTED'}</span>
              <span className="live-label">{historical ? 'Current engine · history view' : 'Python simulation'}</span></div>
              <div className="lifecycle">
                <button className="start-button" disabled={disabled || state !== 'READY'} onClick={() => command('start')}>▶ Start</button>
                <button disabled={disabled || state !== 'RUNNING'} onClick={() => command('pause')}>Ⅱ Pause</button>
                <button disabled={disabled || state !== 'PAUSED'} onClick={() => command('resume')}>↗ Resume</button>
                <button className="reset-button" disabled={disabled || !Number.isSafeInteger(Number(seed)) || String(seed).trim() === ''}
                  onClick={() => command('reset', { seed: Number(seed) })}>↺ Reset</button>
              </div></div>
            <div className="run-metrics"><div><span>VIRTUAL TIME · UTC</span><strong data-testid="virtual-time">{utc(snapshot?.virtual_at)}</strong></div>
              <div><span>CURRENT CONTEXT</span><strong>{snapshot?.phase?.replaceAll('_', ' ') || '—'}</strong></div>
              <div><span>RETAINED OBSERVATIONS</span><strong data-testid="retained-count">{snapshot?.retained_observations?.toLocaleString() || '0'}<small> / {snapshot?.record_limit?.toLocaleString() || '—'}</small></strong></div></div>
            <div className="run-bottom"><span title={snapshot?.run_id}>RUN <code data-testid="run-id">{snapshot?.run_id || 'Waiting for engine'}</code></span>
              <span>ORIGIN <b data-testid="origin">{utc(snapshot?.origin)} UTC</b></span></div>
          </div>
          <div className="results-heading"><div><h2>{activeProfile?.name?.split(' ')[0] || 'Crew'}’s signals <span>09</span></h2><p>Observed values and synthetic personal references. No medical scoring.</p></div>
            <div className="history-select"><label htmlFor="run-history">View run</label><select id="run-history" disabled={!snapshot || busy}
              value={run || snapshot?.run_id || ''} onChange={event => setRun(event.target.value)}>
              {snapshot?.runs.map((item, index) => <option key={item.run_id} value={item.run_id}>Run {index + 1}{item.run_id === snapshot.run_id ? ' · current' : ' · retained'}</option>)}
            </select></div></div>
          {historical && <div className="history-banner">Viewing a retained run. Origin {utc(snapshot.selected_origin)} UTC. Controls are disabled. <button onClick={() => setRun(snapshot.run_id)}>Return to current run →</button></div>}
          <div className="trend-toolbar"><div className="chart-legend"><span><i className="observed-swatch" />Measured</span><span><i className="original-swatch" />Original reference</span><span><i className="context-swatch" />Context reference</span></div>
            <div className="advance-controls"><span>Advance virtual time</span><button disabled={disabled || state !== 'RUNNING'} onClick={() => command('step', { days: 1 })}>+1 day</button><button disabled={disabled || state !== 'RUNNING'} onClick={() => command('step', { days: 28 })}>+28 days</button></div></div>
          <div className="signals-grid">{catalog ? catalog.families.map((family, index) => <SignalCard key={`${snapshot?.selected_run_id}-${profile}-${family.code}`}
            family={family} index={index} data={viewSnapshot?.families.find(item => item.code === family.code)} />)
            : <div className="waiting-panel"><Orbit /><h3>Waiting for the Python engine</h3><p>Start the local API to load all nine indicator families.</p><code>python -m simulation.api</code></div>}</div>
          <div className="cadence-note"><span>◷</span><p><strong>Slow changes take simulated time.</strong> Muscle samples arrive every 7 virtual days; bone density every 28. Empty charts mean no measurement is due yet. Lines connect measured points; no values are invented between them.</p></div>
          <details className="engine-notes"><summary>About this local experiment <span>+</span></summary><p>All measurements come from the existing Python engine, with seed-based noise and individual synthetic baselines. Recovery maps to OTHER; sleep sessions use SLEEPING. Baseline lines are configured references, not clinical thresholds. Plots show the latest 120 measured points per metric and selected run. History is retained in memory until the API process exits. Python never connects to a database. Optional browser delivery is separate and requires officer approval. No alert engine or trained model is connected.</p></details>
        </section>
      </div>
    </main>
    <footer><span><Orbit small /> AstroHealth <b> / </b> Simulation lab</span><span>Synthetic observations only <i>·</i> Python engine {catalog?.engine_version || '—'} <i>·</i> No database connection from Python</span></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
