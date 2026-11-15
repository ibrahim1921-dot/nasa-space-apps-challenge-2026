'use client';

import { useEmergency } from '../hooks/useEmergency.jsx';
import { FLOWS } from '../content/emergency.js';
import { crewNameFor } from '../lib/provenance.js';
import { CopySummary } from './EmergencyGuide.jsx';

const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Past (and open) emergencies, newest first, each with its flight-surgeon summary. */
export default function EmergencyList({ list, empty = 'No emergencies recorded.', titleId }) {
  const { summaryFor, actions } = useEmergency();
  if (!list.length) return <p className="muted">{empty}</p>;
  return (
    <ol className="emg-list" aria-labelledby={titleId}>
      {list.map((e) => (
        <li key={e.id} className="emg-list__item">
          <details>
            <summary className="emg-list__head">
              <span>
                <time dateTime={e.started_at}>{when(e.started_at)}</time> · {e.patient_crew_id ? crewNameFor(e.patient_crew_id) ?? e.patient_crew_id : 'Someone else'} ·{' '}
                {FLOWS[e.flow].short} · reported by {e.reporter.name}
              </span>
              {e.drill && <span className="chip chip--watch">DRILL</span>}
              <span className={`chip ${e.ended_at ? 'chip--muted' : 'chip--alert'}`}>{e.ended_at ? 'Ended' : 'Open'}</span>
              {!e.on_server && <span className="chip chip--muted">On device</span>}
            </summary>
            <div className="emg-list__body">
              {!e.ended_at && (
                <button type="button" className="btn btn--secondary" onClick={() => actions.show('live', e.id)}>
                  Open live view
                </button>
              )}
              <CopySummary text={summaryFor(e)} />
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}
