'use client';

import StatusChip from './StatusChip.jsx';

const RANK = { alert: 0, watch: 1 };
const MAX = 3;

/** One line per flagged reading: the reason, if there is one, else its trend text. */
const reasonOf = (c) => c.reasons?.[0] ?? c.trendText ?? '';

/**
 * Only the readings on watch or alert, worst first, at most 3.
 * @param {{ cards: object[], onOpen: (id: string) => void, onOpenAll: () => void }} props
 */
export default function NeedsAttention({ cards, onOpen, onOpenAll }) {
  const flagged = cards.filter((c) => c.status === 'watch' || c.status === 'alert').sort((a, b) => RANK[a.status] - RANK[b.status]);
  const shown = flagged.slice(0, MAX);

  return (
    <section className="card attention" aria-labelledby="attention-title">
      <h2 id="attention-title" className="card__title">
        Needs attention
      </h2>
      {shown.length === 0 ? (
        <p className="attention__clear">All readings are within your limits and usual range.</p>
      ) : (
        <ul className="attention__list">
          {shown.map((c) => (
            <li key={c.id} className="attention__item">
              <div className="attention__head">
                <StatusChip status={c.status} icon />
                <span className="attention__name">{c.name}</span>
              </div>
              <p className="attention__reason">{reasonOf(c)}</p>
              <button type="button" className="link-btn" onClick={() => onOpen(c.id)}>
                See details<span className="sr-only"> for {c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {flagged.length > MAX && (
        <button type="button" className="link-btn" onClick={onOpenAll}>
          {flagged.length - MAX} more on the Vitals page
        </button>
      )}
    </section>
  );
}
