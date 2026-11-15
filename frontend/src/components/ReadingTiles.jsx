'use client';

import StatusChip from './StatusChip.jsx';
import ProvenanceChip from './ProvenanceChip.jsx';

/**
 * Compact readings: name, value and status only. Each tile opens the reading's detail.
 * @param {{ cards: object[], selectedId?: string, onOpen: (id: string) => void, layout?: 'grid'|'list', label: string }} props
 */
export default function ReadingTiles({ cards, selectedId = null, onOpen, layout = 'grid', label }) {
  return (
    <ul className={`tiles tiles--${layout}`} aria-label={label}>
      {cards.map((c) => {
        const active = c.id === selectedId;
        return (
          <li key={c.id}>
            <button
              type="button"
              className={`tile tile--${c.status}${active ? ' is-active' : ''}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => onOpen(c.id)}
            >
              <span className="tile__name">{c.name}</span>
              <span className="tile__value">
                <span className="num">{c.value}</span>
                {c.unit && <span className="tile__unit"> {c.unit}</span>}
              </span>
              {c.missing ? <span className="chip chip--muted tile__missing">{c.missingText}</span> : <StatusChip status={c.status} />}
              {c.sample && <span className="tile__sample">Sample</span>}
              {c.provenance && <ProvenanceChip chip={c.provenance} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
