'use client';

import { useEffect, useState } from 'react';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { ACTIVITY_OPTIONS, contextLabel } from '../lib/observationContext.js';
import { getObservationHistory } from '../services/observationHistory.js';
import ObservationContext from './ObservationContext.jsx';

const outcomes = { WITHIN_BOUNDS: 'Within configured bounds', ALERT_CREATED: 'Monitoring alert', MISSING_RULE: 'No applicable rule', MISSING_BASELINE: 'Baseline unavailable' };

export default function PersistedObservationHistory({ crewCode }) {
  // Live backend sessions only: demo mode has no database history to show.
  const { crewId, isCmo, isDemo } = useOnboard();
  const allowed = Boolean(crewCode && (isCmo || crewId === crewCode));
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (isDemo || !allowed || !open) return;
    const controller = new AbortController();
    setData(null); setError(''); setLoading(true);
    getObservationHistory(crewCode, { page, activity, signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isDemo, allowed, open, crewCode, page, activity, refresh]);
  if (isDemo || !allowed) return null;
  return <details className="card observation-history" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Persisted observations</summary>
    <div className="observation-history__controls">
      <label className="field">Activity<select className="input" value={activity} onChange={(event) => { setActivity(event.target.value); setPage(0); }}>
        <option value="">All activities</option>{ACTIVITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>
      <button type="button" className="btn btn--secondary" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
    </div>
    {loading && <p role="status">Loading persisted observations...</p>}
    {error && <p className="field__error" role="alert">{error}</p>}
    {data && <>
      {!data.content.length && <p>No persisted observations for this activity.</p>}
      {data.content.map((observation) => <article className="observation-history__entry" key={observation.id}>
        <h4>{observation.name}{observation.synthetic && <span className="chip chip--muted">Synthetic</span>}</h4>
        {observation.measurements.map((measurement) => <p key={measurement.metric}><strong>{contextLabel(measurement.metric)}: {measurement.value} {measurement.unit}</strong></p>)}
        <p className="muted">{observation.evaluations.length ? observation.evaluations.map((evaluation) => outcomes[evaluation.outcome] || contextLabel(evaluation.outcome)).join(' · ') : 'Not evaluated'}</p>
        {observation.superseded && <p className="muted">Superseded observation; retained for history.</p>}
        <ObservationContext context={observation.context} />
      </article>)}
      <div className="observation-history__controls"><button className="btn btn--secondary" disabled={loading || page === 0} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page + 1}</span><button className="btn btn--secondary" disabled={loading || !data.hasNext} onClick={() => setPage((value) => value + 1)}>Next</button></div>
    </>}
  </details>;
}
