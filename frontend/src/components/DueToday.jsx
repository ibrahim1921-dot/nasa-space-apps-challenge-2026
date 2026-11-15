'use client';

import { ReminderItem } from './ReminderBell.jsx';

/**
 * Today's "Due today" card: at most 3 reminders from the same list as the header bell (hooks/useReminders.js),
 * and "See all", which opens the bell panel. Renders nothing when nothing is due.
 * @param {{ reminders: object, onAction: (item) => void, onSeeAll: () => void }} props
 */
export default function DueToday({ reminders, onAction, onSeeAll }) {
  const items = reminders.dueToday;
  if (!items.length) return null;
  const more = reminders.count - items.length;
  return (
    <section className="card due-today" aria-labelledby="due-today-title">
      <div className="card__head">
        <h2 id="due-today-title" className="card__title">
          Due today
        </h2>
        <button type="button" className="link-btn due-today__all" onClick={onSeeAll}>
          See all{more > 0 ? ` (${reminders.count})` : ''}
        </button>
      </div>
      <ul className="reminders__list due-today__list">
        {items.map((item) => (
          <ReminderItem
            key={item.id}
            item={item}
            reminders={reminders}
            compact
            // A ground message opens in the bell panel, where it can be read.
            onAction={item.action.id === 'message' ? onSeeAll : onAction}
          />
        ))}
      </ul>
    </section>
  );
}
