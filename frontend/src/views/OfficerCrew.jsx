'use client';

// Ground medical officer: the crew.
//   Live:  roster from GET /api/crew, open alerts per person from GET /api/alerts?status=OPEN.
//   Local: each person's health status and readings come from the bundled synthetic records and this
//          device (teammate dashboard, views/CrewHealthDashboard.jsx), because the backend has no
//          measurement-history endpoint yet.

import { useEffect, useMemo, useState } from 'react';
import { listCrewAlerts } from '../services/alertService.js';
import CrewHealthDashboard from './CrewHealthDashboard.jsx';
import { SourceTag, StateMessage } from '../components/integration/Bits.jsx';

export default function OfficerCrew({ roster, onOpenAlerts }) {
  const [open, setOpen] = useState({ loading: true, error: null, counts: new Map(), total: 0, partial: false });

  useEffect(() => {
    if (!roster.data) return undefined;
    let active = true;
    (async () => {
      try {
        const page = await listCrewAlerts({ status: 'OPEN', size: 100 });
        const counts = new Map();
        for (const a of page.content ?? []) counts.set(a.astronautId, (counts.get(a.astronautId) ?? 0) + 1);
        if (active) setOpen({ loading: false, error: null, counts, total: page.totalElements ?? 0, partial: Boolean(page.hasNext) });
      } catch (error) {
        if (active) setOpen({ loading: false, error, counts: new Map(), total: 0, partial: false });
      }
    })();
    return () => {
      active = false;
    };
  }, [roster.data]);

  const live = useMemo(() => roster.data ?? [], [roster.data]);

  return (
    <div className="ix-screen">
      <section className="card card--lg" aria-labelledby="roster-title">
        <div className="ix-screen__head">
          <h2 id="roster-title" className="view-title">
            Crew roster
          </h2>
          <SourceTag kind="live" />
        </div>
        <StateMessage loading={roster.loading} error={roster.error} onRetry={roster.reload} empty={!roster.loading && live.length === 0} emptyText="The backend lists no active crew.">
          <ul className="ix-roster">
            {live.map((c) => {
              const n = open.counts.get(c.astronautId) ?? 0;
              return (
                <li key={c.astronautId ?? c.crewId} className="ix-roster__item">
                  <div>
                    <p className="ix-roster__name">{c.name}</p>
                    <p className="muted">
                      {c.crewId}
                      {c.title && <> · {c.title} <span className="ix-source ix-source--local">local title</span></>}
                    </p>
                  </div>
                  <div className="ix-roster__alerts">
                    {open.loading ? (
                      <span className="muted">Checking alerts…</span>
                    ) : open.error ? (
                      <span className="muted">Alerts unavailable</span>
                    ) : (
                      <button type="button" className="btn btn--secondary" onClick={() => onOpenAlerts(c.astronautId)}>
                        {n === 0 ? 'No open alerts' : `${n}${open.partial ? '+' : ''} open alert${n === 1 ? '' : 's'}`}
                      </button>
                    )}
                    {!c.hasLocalData && <span className="muted">No local records for this crew code</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </StateMessage>
      </section>

      <div className="ix-local">
        <p className="ix-local__label">
          <SourceTag kind="local" /> Health status below is computed on this device from synthetic crew records. The backend has no
          observation history endpoint yet.
        </p>
        <CrewHealthDashboard roster={roster.data ?? null} />
      </div>
    </div>
  );
}
