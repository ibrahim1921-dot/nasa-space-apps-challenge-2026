'use client';

// Health alerts from the backend (backend/docs/health-alert-api-phase4e2.md).
//   Astronaut "My alerts": GET /api/alerts/me, detail, acknowledge.
//   Ground officer "Alerts": GET /api/alerts with filters + pagination, detail with evidence,
//   acknowledge, resolve with a required note (max 2000 characters).
// "Synthetic / not clinical" is shown wherever the backend sets `synthetic` or `nonclinical`.
// Reasons and notes are rendered as plain text, as the API doc requires.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { NOTE_MAX, validateNote } from '../lib/api.js';
import {
  INDICATORS,
  SEVERITIES,
  STATUSES,
  acknowledgeAlert,
  alertActions,
  getAlert,
  indicatorLabel,
  isSyntheticAlert,
  listCrewAlerts,
  listMyAlerts,
  resolveAlert,
} from '../services/alertService.js';
import { AlertStatus, Severity, SourceTag, StateMessage, SyntheticBadge, when } from '../components/integration/Bits.jsx';

const EMPTY_FILTER = { status: '', severity: '', indicator: '', astronautId: '', synthetic: '', fromDay: '', toDay: '', page: 0 };
const STATUS_WORD = { OPEN: 'Open', ACKNOWLEDGED: 'Acknowledged', RESOLVED: 'Resolved' };
const SEVERITY_WORD = { INFO: 'Info', WARNING: 'Warning', CRITICAL: 'Critical' };
const EVENT_WORD = { CREATED: 'Created', EVIDENCE_ADDED: 'Evidence added', ACKNOWLEDGED: 'Acknowledged', RESOLVED: 'Resolved' };

function Filters({ filter, onChange, officer, crew }) {
  const set = (key) => (e) => onChange({ ...filter, [key]: e.target.value, page: 0 });
  return (
    <form className="ix-filters" onSubmit={(e) => e.preventDefault()} aria-label="Filter alerts">
      <label className="ix-field">
        Status
        <select className="input" value={filter.status} onChange={set('status')}>
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_WORD[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="ix-field">
        Severity
        <select className="input" value={filter.severity} onChange={set('severity')}>
          <option value="">All</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_WORD[s]}
            </option>
          ))}
        </select>
      </label>
      {officer && (
        <label className="ix-field">
          Astronaut
          <select className="input" value={filter.astronautId} onChange={set('astronautId')}>
            <option value="">Whole crew</option>
            {crew.map((c) => (
              <option key={c.astronautId} value={c.astronautId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="ix-field">
        Indicator
        <select className="input" value={filter.indicator} onChange={set('indicator')}>
          <option value="">All</option>
          {INDICATORS.map((i) => (
            <option key={i.code} value={i.code}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <label className="ix-field">
        Data
        <select className="input" value={filter.synthetic} onChange={set('synthetic')}>
          <option value="">Synthetic and real</option>
          <option value="true">Synthetic only</option>
          <option value="false">Not synthetic</option>
        </select>
      </label>
      <label className="ix-field">
        From
        <input className="input" type="date" value={filter.fromDay} onChange={set('fromDay')} />
      </label>
      <label className="ix-field">
        To (inclusive)
        <input className="input" type="date" value={filter.toDay} onChange={set('toDay')} />
      </label>
      <button type="button" className="btn btn--secondary ix-filters__reset" onClick={() => onChange(EMPTY_FILTER)}>
        Clear filters
      </button>
    </form>
  );
}

function AlertRow({ alert, name, selected, onOpen }) {
  return (
    <li className={`ix-alert ix-alert--${alert.severity?.toLowerCase()}${selected ? ' is-selected' : ''}`}>
      <div className="ix-alert__chips">
        <Severity severity={alert.severity} />
        <AlertStatus status={alert.status} />
        <SyntheticBadge show={isSyntheticAlert(alert)} />
      </div>
      <p className="ix-alert__reason">{alert.reason || 'No reason recorded.'}</p>
      <p className="muted ix-alert__meta">
        {name && <span>{name} · </span>}
        {(alert.indicators ?? []).map(indicatorLabel).join(', ') || 'No indicator'} · <time dateTime={alert.triggeredAt}>{when(alert.triggeredAt)}</time>
      </p>
      <button type="button" className="btn btn--secondary ix-alert__open" onClick={() => onOpen(alert.id)} aria-pressed={selected}>
        {selected ? 'Showing details' : 'View details'}
      </button>
    </li>
  );
}

function Evidence({ observations }) {
  if (!observations?.length) return <p className="muted">No observation evidence attached.</p>;
  return (
    <ol className="ix-evidence">
      {observations.map((o) => (
        <li key={o.observationId} className="ix-evidence__item">
          <p className="ix-evidence__head">
            <strong>{indicatorLabel(o.indicator)}</strong>
            <SyntheticBadge show={o.synthetic} />
          </p>
          <p className="muted">
            <time dateTime={o.measuredAt}>{when(o.measuredAt)}</time> · context {o.activityContext ?? '—'} · source {o.sourceKind ?? '—'}
            {o.supersedesObservationId && ' · revision of an earlier observation'}
          </p>
          {o.measurements?.length > 0 && (
            <dl className="ix-measure">
              {o.measurements.map((m) => (
                <div key={m.metric}>
                  <dt>{m.metric.replace(/_/g, ' ')}</dt>
                  <dd className="num">
                    {m.value} {m.unit}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ol>
  );
}

function References({ rule, baseline, evaluation }) {
  if (!rule && !baseline && !evaluation) return <p className="muted">No rule, baseline or evaluation attached (manual or legacy alert).</p>;
  const bound = (lo, hi, unit = '') => `${lo ?? '—'} to ${hi ?? '—'}${unit ? ` ${unit}` : ''}`;
  return (
    <dl className="ix-refs">
      {rule && (
        <div>
          <dt>Rule</dt>
          <dd>
            v{rule.version} · {indicatorLabel(rule.indicator)} {rule.metric} · {rule.limitKind} · bounds {bound(rule.lowerBound, rule.upperBound, rule.unit)} · {rule.designation}
          </dd>
        </div>
      )}
      {baseline && (
        <div>
          <dt>Personal baseline</dt>
          <dd>
            v{baseline.version} · {baseline.kind} · reference {baseline.referenceValue} {baseline.unit}
          </dd>
        </div>
      )}
      {evaluation && (
        <div>
          <dt>Evaluation</dt>
          <dd>
            <time dateTime={evaluation.evaluatedAt}>{when(evaluation.evaluatedAt)}</time> · effective bounds {bound(evaluation.lowerBound, evaluation.upperBound)}
          </dd>
        </div>
      )}
    </dl>
  );
}

function ResolveForm({ onResolve, busy }) {
  const id = useId();
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState(null);
  const ref = useRef(null);
  async function submit(e) {
    e.preventDefault();
    const p = validateNote(note);
    setProblem(p);
    if (p) return ref.current?.focus();
    await onResolve(note);
  }
  return (
    <form className="ix-resolve" onSubmit={submit} noValidate>
      <label htmlFor={`${id}-note`} className="ix-field">
        Resolution note (required)
        <textarea
          ref={ref}
          id={`${id}-note`}
          className="input ix-resolve__note"
          rows={4}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-invalid={Boolean(problem)}
          aria-describedby={`${id}-count${problem ? ` ${id}-err` : ''}`}
          disabled={busy}
          required
        />
      </label>
      <p id={`${id}-count`} className="muted ix-resolve__count">
        {note.length} / {NOTE_MAX} characters
      </p>
      {problem && (
        <p id={`${id}-err`} className="field__error">
          {problem}
        </p>
      )}
      <button type="submit" className="btn btn--primary" disabled={busy}>
        {busy ? 'Resolving…' : 'Resolve alert'}
      </button>
    </form>
  );
}

function Detail({ id, role, name, onChanged, onClose }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [done, setDone] = useState(null);
  const headingRef = useRef(null);

  const load = useCallback(async () => {
    setState({ loading: true, error: null, data: null });
    try {
      setState({ loading: false, error: null, data: await getAlert(id) });
    } catch (error) {
      setState({ loading: false, error, data: null });
    }
  }, [id]);

  useEffect(() => {
    load();
    setActionError(null);
    setDone(null);
  }, [load]);

  useEffect(() => {
    if (!state.loading) headingRef.current?.focus();
  }, [state.loading]);

  async function run(action, message) {
    setBusy(true);
    setActionError(null);
    try {
      const data = await action();
      setState({ loading: false, error: null, data });
      setDone(message);
      onChanged?.();
    } catch (error) {
      setActionError(error);
    } finally {
      setBusy(false);
    }
  }

  const alert = state.data?.alert;
  const actions = alertActions(alert, role);

  return (
    <section className="card card--lg ix-detail" aria-labelledby="alert-detail-title">
      <div className="ix-detail__head">
        <h3 id="alert-detail-title" ref={headingRef} tabIndex={-1} className="card__title">
          Alert details
        </h3>
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Close
        </button>
      </div>
      <StateMessage loading={state.loading} error={state.error} onRetry={load}>
        {alert && (
          <>
            <div className="ix-alert__chips">
              <Severity severity={alert.severity} />
              <AlertStatus status={alert.status} />
              <SyntheticBadge show={isSyntheticAlert(alert)} />
            </div>
            {isSyntheticAlert(alert) && (
              <p className="ix-note">The backend marks this alert as synthetic and nonclinical. It is demonstration data, not a clinical finding.</p>
            )}
            <p className="ix-alert__reason">{alert.reason || 'No reason recorded.'}</p>
            <dl className="ix-refs">
              {name && (
                <div>
                  <dt>Astronaut</dt>
                  <dd>{name}</dd>
                </div>
              )}
              <div>
                <dt>Trigger</dt>
                <dd>{alert.triggerType}</dd>
              </div>
              <div>
                <dt>Triggered</dt>
                <dd>
                  <time dateTime={alert.triggeredAt}>{when(alert.triggeredAt)}</time>
                </dd>
              </div>
              {alert.acknowledgedAt && (
                <div>
                  <dt>Acknowledged</dt>
                  <dd>
                    <time dateTime={alert.acknowledgedAt}>{when(alert.acknowledgedAt)}</time>
                  </dd>
                </div>
              )}
              {alert.resolvedAt && (
                <div>
                  <dt>Resolved</dt>
                  <dd>
                    <time dateTime={alert.resolvedAt}>{when(alert.resolvedAt)}</time>
                  </dd>
                </div>
              )}
            </dl>
            {state.data.resolutionNote && (
              <div className="ix-detail__section">
                <h4>Resolution note</h4>
                <p className="ix-pre">{state.data.resolutionNote}</p>
              </div>
            )}
            <div className="ix-detail__section">
              <h4>Evidence</h4>
              <Evidence observations={state.data.observations} />
            </div>
            <div className="ix-detail__section">
              <h4>Rule, baseline and evaluation</h4>
              <References rule={state.data.rule} baseline={state.data.baseline} evaluation={state.data.evaluation} />
            </div>
            <div className="ix-detail__section">
              <h4>History</h4>
              <ol className="ix-history">
                {(state.data.history ?? []).map((e, i) => (
                  <li key={`${e.kind}-${i}`}>
                    {EVENT_WORD[e.kind] ?? e.kind} · <time dateTime={e.occurredAt}>{when(e.occurredAt)}</time>
                  </li>
                ))}
              </ol>
            </div>

            <div className="ix-detail__actions" aria-live="polite">
              {done && (
                <p className="ix-done" role="status">
                  {done}
                </p>
              )}
              {actionError && <StateMessage error={actionError} />}
              {actions.canAcknowledge && (
                <button type="button" className="btn btn--primary" disabled={busy} onClick={() => run(() => acknowledgeAlert(alert.id), 'Alert acknowledged.')}>
                  {busy ? 'Acknowledging…' : 'Acknowledge'}
                </button>
              )}
              {actions.needsAcknowledgeFirst && <p className="muted">Acknowledge this alert first; then it can be resolved.</p>}
              {actions.canResolve && <ResolveForm busy={busy} onResolve={(note) => run(() => resolveAlert(alert.id, note), 'Alert resolved.')} />}
            </div>
          </>
        )}
      </StateMessage>
    </section>
  );
}

/** @param {{ officer?: boolean, crew?: Array<{ astronautId, name }> }} props */
export default function Alerts({ officer = false, crew = [], initialAstronautId = '' }) {
  const { isDemo, account } = useOnboard();
  const role = account?.backendRole;
  const [filter, setFilter] = useState(() => ({ ...EMPTY_FILTER, astronautId: officer ? initialAstronautId : '' }));
  const [state, setState] = useState({ loading: true, error: null, page: null });
  const [selected, setSelected] = useState(null);
  const names = new Map(crew.map((c) => [c.astronautId, c.name]));

  const load = useCallback(async () => {
    if (isDemo) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = officer ? await listCrewAlerts(filter) : await listMyAlerts(filter);
      setState({ loading: false, error: null, page });
    } catch (error) {
      setState({ loading: false, error, page: null });
    }
  }, [filter, officer, isDemo]);

  useEffect(() => {
    load();
  }, [load]);

  const title = officer ? 'Crew alerts' : 'My alerts';

  if (isDemo) {
    return (
      <section className="card card--lg ix-screen" aria-labelledby="alerts-title">
        <h2 id="alerts-title" className="view-title">
          {title}
        </h2>
        <div className="ix-state ix-state--empty" role="status">
          <p>
            Alerts come from the team&apos;s backend. You are exploring with demo data, so there are none here. Sign out and sign in
            with a backend account to see real alerts.
          </p>
        </div>
      </section>
    );
  }

  const page = state.page;
  const content = page?.content ?? [];

  return (
    <div className="ix-screen">
      <section className="card card--lg" aria-labelledby="alerts-title">
        <div className="ix-screen__head">
          <h2 id="alerts-title" className="view-title">
            {title}
          </h2>
          <SourceTag kind="live" />
        </div>
        <p className="muted">
          {officer
            ? 'Alerts raised for the crew. Acknowledge an open alert, then resolve it with a note.'
            : 'Alerts raised for you. Acknowledge one to tell the ground team you have seen it.'}{' '}
          Alerts support a human decision; they are not a diagnosis.
        </p>
        <Filters filter={filter} onChange={setFilter} officer={officer} crew={crew} />
        <StateMessage
          loading={state.loading && !page}
          error={state.error}
          onRetry={load}
          empty={!state.loading && content.length === 0}
          emptyText={Object.entries(filter).every(([k, v]) => k === 'page' || !v) ? 'No alerts.' : 'No alerts match these filters.'}
        >
          <ul className="ix-alerts" aria-busy={state.loading}>
            {content.map((a) => (
              <AlertRow key={a.id} alert={a} name={officer ? names.get(a.astronautId) ?? 'Unknown crew member' : null} selected={selected === a.id} onOpen={setSelected} />
            ))}
          </ul>
        </StateMessage>
        {page && page.totalPages > 1 && (
          <nav className="ix-pager" aria-label="Alert pages">
            <button type="button" className="btn btn--secondary" disabled={page.page === 0 || state.loading} onClick={() => setFilter({ ...filter, page: page.page - 1 })}>
              Previous
            </button>
            <span className="num">
              Page {page.page + 1} of {page.totalPages} · {page.totalElements} alerts
            </span>
            <button type="button" className="btn btn--secondary" disabled={!page.hasNext || state.loading} onClick={() => setFilter({ ...filter, page: page.page + 1 })}>
              Next
            </button>
          </nav>
        )}
      </section>
      {selected && (
        <Detail
          id={selected}
          role={role}
          name={officer ? names.get(content.find((a) => a.id === selected)?.astronautId) : null}
          onChanged={load}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
