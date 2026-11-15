'use client';

// Ground medical officer: monitoring rules, read only (backend/docs/monitoring-rules-phase4d2.md).
//   GET /api/monitoring-rules  every immutable version with provenance and activation history.
// Creating and activating rules is not offered here yet.

import { useCallback, useEffect, useState } from 'react';
import { monitoringRules, ruleActiveNow } from '../services/baselineService.js';
import { indicatorLabel } from '../services/alertService.js';
import { Icon, SourceTag, StateMessage, SyntheticBadge, when } from '../components/integration/Bits.jsx';

const DESIGNATION = { CLINICAL_REFERENCE: 'Clinical reference', OPERATIONAL: 'Operational', SYNTHETIC_DEMO: 'Synthetic demo' };

export default function Rules({ roster }) {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const names = new Map((roster.data ?? []).map((c) => [c.astronautId, c.name]));
  const load = useCallback(async () => {
    setState({ loading: true, error: null, rows: [] });
    try {
      const rows = await monitoringRules();
      setState({ loading: false, error: null, rows: Array.isArray(rows) ? rows : [] });
    } catch (error) {
      setState({ loading: false, error, rows: [] });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="ix-screen">
      <section className="card card--lg" aria-labelledby="rules-title">
        <div className="ix-screen__head">
          <h2 id="rules-title" className="view-title">
            Monitoring rules
          </h2>
          <SourceTag kind="live" />
        </div>
        <p className="muted">Rule versions and whether each is active now. Read only here. Rules start inactive until an officer schedules activation.</p>
        <StateMessage loading={state.loading} error={state.error} onRetry={load} empty={!state.loading && state.rows.length === 0} emptyText="No monitoring rules yet. None are seeded.">
          <div className="ix-table-wrap">
            <table className="ix-table">
              <caption className="sr-only">Monitoring rules</caption>
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col">Indicator</th>
                  <th scope="col">Bounds</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Designation</th>
                  <th scope="col">Applies to</th>
                  <th scope="col">Now</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r) => {
                  const active = ruleActiveNow(r);
                  return (
                    <tr key={r.id}>
                      <td>
                        {r.rule_code} <span className="muted">v{r.version}</span>
                      </td>
                      <td>
                        {indicatorLabel(r.indicator_code)} <span className="muted">{r.metric_code}</span>
                      </td>
                      <td className="num">
                        {r.lower_bound ?? '—'} to {r.upper_bound ?? '—'} {r.unit} <span className="muted">({r.limit_kind})</span>
                      </td>
                      <td>{r.severity}</td>
                      <td>
                        {DESIGNATION[r.designation] ?? r.designation}
                        {r.designation === 'SYNTHETIC_DEMO' && (
                          <>
                            {' '}
                            <SyntheticBadge />
                          </>
                        )}
                      </td>
                      <td>{r.astronaut_id ? names.get(r.astronaut_id) ?? 'One astronaut' : 'Whole crew'}</td>
                      <td>
                        {active ? (
                          <span className="ix-chip ix-chip--resolved">
                            <Icon name="resolved" size={14} /> Active
                          </span>
                        ) : (
                          <span className="ix-chip ix-chip--open">
                            <Icon name="open" size={14} /> Inactive
                          </span>
                        )}
                        <span className="muted ix-table__sub">valid from {when(r.valid_from)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </StateMessage>
      </section>
    </div>
  );
}
