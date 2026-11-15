'use client';

// Ground medical officer: personal baselines, read only (backend/docs/personal-baselines-phase4d1.md).
//   GET /api/crew/{astronautId}/baselines/versions  stored versions (legacy unapproved rows included)
//   GET /api/crew/{astronautId}/baselines           proposal history and approvals
// Proposing and approving need real observation UUIDs and a second officer; not offered here yet.

import { useCallback, useEffect, useState } from 'react';
import { baselineApproved, baselineProposals, baselineVersions } from '../services/baselineService.js';
import { indicatorLabel } from '../services/alertService.js';
import { Icon, SourceTag, StateMessage, when } from '../components/integration/Bits.jsx';

function useRows(load, key) {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const run = useCallback(async () => {
    if (!key) return;
    setState({ loading: true, error: null, rows: [] });
    try {
      const rows = await load(key);
      setState({ loading: false, error: null, rows: Array.isArray(rows) ? rows : [] });
    } catch (error) {
      setState({ loading: false, error, rows: [] });
    }
  }, [load, key]);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run };
}

export default function Baselines({ roster }) {
  const crew = roster.data ?? [];
  const [astronautId, setAstronautId] = useState('');
  const chosen = astronautId || crew[0]?.astronautId || '';
  const versions = useRows(baselineVersions, chosen);
  const proposals = useRows(baselineProposals, chosen);
  const pending = proposals.rows.filter((p) => !p.approved_at);

  return (
    <div className="ix-screen">
      <section className="card card--lg" aria-labelledby="baselines-title">
        <div className="ix-screen__head">
          <h2 id="baselines-title" className="view-title">
            Personal baselines
          </h2>
          <SourceTag kind="live" />
        </div>
        <p className="muted">
          Each person&apos;s approved reference values. Read only here. Personal references are not clinical limits.
        </p>
        <StateMessage loading={roster.loading} error={roster.error} onRetry={roster.reload} empty={!roster.loading && crew.length === 0} emptyText="No crew to show.">
          <label className="ix-field ix-field--inline">
            Astronaut
            <select className="input" value={chosen} onChange={(e) => setAstronautId(e.target.value)}>
              {crew.map((c) => (
                <option key={c.astronautId} value={c.astronautId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <h3 className="card__title">Versions</h3>
          <StateMessage loading={versions.loading} error={versions.error} onRetry={versions.reload} empty={!versions.loading && versions.rows.length === 0} emptyText="No baseline versions stored for this person.">
            <div className="ix-table-wrap">
              <table className="ix-table">
                <caption className="sr-only">Baseline versions</caption>
                <thead>
                  <tr>
                    <th scope="col">Indicator</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Version</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Context</th>
                    <th scope="col">Effective</th>
                    <th scope="col">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.rows.map((b) => (
                    <tr key={b.id}>
                      <td>
                        {indicatorLabel(b.indicator_code)} <span className="muted">{b.metric_code}</span>
                      </td>
                      <td>{b.baseline_kind}</td>
                      <td className="num">{b.version}</td>
                      <td className="num">
                        {b.reference_value} {b.unit}
                      </td>
                      <td>{b.activity_context}</td>
                      <td>
                        {when(b.effective_from)} → {b.effective_to ? when(b.effective_to) : 'open'}
                      </td>
                      <td>
                        {baselineApproved(b) ? (
                          <span className="ix-chip ix-chip--resolved">
                            <Icon name="resolved" size={14} /> Approved
                          </span>
                        ) : (
                          <span className="ix-chip ix-chip--open">
                            <Icon name="open" size={14} /> Not approved (legacy)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </StateMessage>

          <h3 className="card__title">Proposals waiting for approval</h3>
          <StateMessage loading={proposals.loading} error={proposals.error} onRetry={proposals.reload} empty={!proposals.loading && pending.length === 0} emptyText="No pending proposals.">
            <ul className="ix-list">
              {pending.map((p) => (
                <li key={p.proposal_id}>
                  Proposal created <time dateTime={p.created_at}>{when(p.created_at)}</time>. Approval needs a different officer.
                </li>
              ))}
            </ul>
          </StateMessage>
        </StateMessage>
      </section>
    </div>
  );
}
