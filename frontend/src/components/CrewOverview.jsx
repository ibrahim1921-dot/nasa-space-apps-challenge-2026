'use client';

import { STATUS_LABELS } from '../constants/status.js';
import StatusIcon from './StatusIcon.jsx';

const stamp = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function EmergencyMark() {
  return (
    <span className="crew-overview__emergency">
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M6.2 1.5h3.6v4.7h4.7v3.6H9.8v4.7H6.2V9.8H1.5V6.2h4.7z" fill="currentColor" />
      </svg>
      Emergency
    </span>
  );
}

/** Missed items (2+ days in a row, from hooks/useReminders.js): watch colour, icon + text. Never red. */
function MissedMark({ missed }) {
  return (
    <span className="crew-overview__missed">
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 4.8V8l2.2 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {missed.text}
      {missed.items.length > 1 && <span className="muted"> · +{missed.items.length - 1} more</span>}
      {missed.level === 'ground' && <span className="crew-overview__missed-ground"> · Listed for ground</span>}
    </span>
  );
}

/**
 * Crew Medical Officer only: her Today. One card per crew member, already ordered by
 * lib/reminders.js orderWithMissed (open emergencies, alert, watch, missed items, normal; her own card last).
 * Choosing a card opens that person's Today, read only; her own card opens "My data".
 * @param {{ cards: { id, name, role, status, reason, lastAt, emergency, missed? }[], selfId: string, onOpen: (id: string) => void }} props
 */
export default function CrewOverview({ cards, selfId, onOpen }) {
  return (
    <section className="crew-overview" aria-labelledby="crew-overview-title">
      <div className="crew-overview__head">
        <h2 id="crew-overview-title" className="view-title crew-overview__title">
          Crew overview
        </h2>
        <p className="muted">Choose a crew member to open their Today, read only. Your own card opens your data.</p>
      </div>
      <ul className="crew-overview__list">
        {cards.map((c) => {
          const self = c.id === selfId;
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`crew-overview__card crew-overview__card--${c.status}${c.emergency ? ' has-emergency' : ''}`}
                onClick={() => onOpen(c.id)}
              >
                <span className="crew-overview__top">
                  <span className="crew-overview__name">
                    {c.name}
                    {self && <span className="crew-overview__me">My data</span>}
                  </span>
                  {c.emergency && <EmergencyMark />}
                </span>
                <span className="crew-overview__role muted">{c.role}</span>
                <span className={`crew-overview__status status-text--${c.status}`}>
                  <StatusIcon status={c.status} size={16} />
                  {STATUS_LABELS[c.status]}
                </span>
                {c.reason && <span className="crew-overview__reason">{c.reason}</span>}
                {c.missed && <MissedMark missed={c.missed} />}
                <span className="crew-overview__time muted">
                  {c.lastAt ? (
                    <>
                      Last check-in <time dateTime={c.lastAt}>{stamp(c.lastAt)}</time>
                    </>
                  ) : (
                    'No check-in yet'
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
