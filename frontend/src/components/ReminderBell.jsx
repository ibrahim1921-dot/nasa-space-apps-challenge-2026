'use client';

import { useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { REMINDER_SETTINGS, TEAM_SET, settingsLine } from '../content/reminderSchedule.js';

function BellIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M10 2.5a5 5 0 0 0-5 5v3.2L3.6 13.4a.7.7 0 0 0 .6 1.1h11.6a.7.7 0 0 0 .6-1.1L15 10.7V7.5a5 5 0 0 0-5-5Z M8 16.5a2 2 0 0 0 4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Clock icon for "Overdue" (watch colour; never red). */
export function OverdueTag() {
  return (
    <span className="reminder__overdue">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 4.8V8l2.2 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      Overdue
    </span>
  );
}

/** A ground message, shown inside the panel. Opening it marks it read (lib/groundInbox.js). */
function MessageView({ message, onClose }) {
  return (
    <div className="reminder__message" role="group" aria-labelledby="reminder-message-title">
      <p id="reminder-message-title" className="reminder__message-subject">
        {message ? message.subject : 'Message'}
      </p>
      {message ? (
        <>
          <p className="muted reminder__message-from">
            {message.from?.name ?? 'Ground'} · {message.priority === 'urgent' ? 'Urgent' : 'Routine'}
          </p>
          <p className="reminder__message-body">{message.body}</p>
        </>
      ) : (
        <p className="muted">This message is no longer available on this device.</p>
      )}
      <button type="button" className="btn btn--secondary" onClick={onClose}>
        Close message
      </button>
    </div>
  );
}

/**
 * One reminder: title, detail, its action, "Snooze 1 h" and "Not today" (with an optional short reason).
 * Exported so the Today card shows the exact same row (compact: action only).
 */
export function ReminderItem({ item, reminders, onAction, compact = false }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const reasonId = `reason-${item.id}`;

  return (
    <li className={`reminder reminder--${item.status}`}>
      <div className="reminder__head">
        <p className="reminder__title">{item.title}</p>
        {item.status === 'overdue' && <OverdueTag />}
        {item.status === 'snoozed' && <span className="reminder__snoozed muted">Snoozed</span>}
      </div>
      <p className="reminder__detail muted">{item.detail}</p>
      {asking ? (
        <form
          className="reminder__reason"
          onSubmit={(e) => {
            e.preventDefault();
            reminders.notToday(item, reason);
          }}
        >
          <label htmlFor={reasonId} className="reminder__reason-label">
            Reason (optional)
          </label>
          <input
            id={reasonId}
            className="input"
            value={reason}
            maxLength={REMINDER_SETTINGS.reasonMaxLength}
            onChange={(e) => setReason(e.target.value)}
            autoComplete="off"
          />
          <div className="reminder__actions">
            <button type="submit" className="btn btn--secondary">
              Not today
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="reminder__actions">
          <button type="button" className="btn btn--primary" onClick={() => onAction(item)}>
            {item.action.label}
          </button>
          {!compact && item.status !== 'snoozed' && (
            <button type="button" className="btn btn--secondary" onClick={() => reminders.snooze(item)}>
              Snooze 1 h
            </button>
          )}
          {!compact && (
            <button type="button" className="btn btn--secondary" onClick={() => setAsking(true)}>
              Not today
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Panel({ reminders, onAction, onClose, bellRef }) {
  const ref = useRef(null);
  useFocusTrap(ref, { onEscape: onClose, getReturnTarget: () => bellRef.current });
  const active = reminders.items.filter((i) => i.status !== 'snoozed');
  const snoozed = reminders.items.filter((i) => i.status === 'snoozed');
  // A ground message opened here: kept on screen after it is marked read (it then leaves the list).
  const [reading, setReading] = useState(null); // null | { message }

  function act(item) {
    if (item.action.id !== 'message') {
      onAction(item);
      return;
    }
    const message = reminders.inbox.find((m) => m.id === item.action.messageId) ?? null;
    setReading({ message });
    reminders.markRead(item.action.messageId);
  }

  return (
    <div ref={ref} id="reminders-panel" className="reminders__panel" role="dialog" aria-modal="false" aria-labelledby="reminders-title" tabIndex={-1}>
      <div className="reminders__panel-head">
        <h2 id="reminders-title" className="reminders__panel-title">
          Reminders
        </h2>
        <button type="button" className="icon-btn reminders__close" aria-label="Close reminders" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {reading && <MessageView message={reading.message} onClose={() => setReading(null)} />}
      {active.length === 0 ? (
        <p className="muted reminders__empty">Nothing due right now.</p>
      ) : (
        <ul className="reminders__list" aria-label="Due now">
          {active.map((item) => (
            <ReminderItem key={item.id} item={item} reminders={reminders} onAction={act} />
          ))}
        </ul>
      )}
      {snoozed.length > 0 && (
        <>
          <h3 className="reminders__sub">Snoozed</h3>
          <ul className="reminders__list" aria-label="Snoozed">
            {snoozed.map((item) => (
              <ReminderItem key={item.id} item={item} reminders={reminders} onAction={act} />
            ))}
          </ul>
        </>
      )}
      <p className="reminders__footer muted">
        {settingsLine()} · <span className="reminders__teamset">{TEAM_SET}</span>
      </p>
    </div>
  );
}

/**
 * Header bell: the number of due + overdue reminders (never snoozed ones). Opens a panel listing them,
 * overdue first. Escape closes it and returns focus to the bell. No sound, no alarm.
 * @param {{ reminders: object, open: boolean, onOpenChange: (open: boolean) => void, onAction: (item) => void, bellRef: object }} props
 */
export default function ReminderBell({ reminders, open, onOpenChange, onAction, bellRef }) {
  const count = reminders.count;
  const label = count === 0 ? 'Reminders: nothing due' : `Reminders: ${count} due`;

  return (
    <div className="reminders">
      <button
        ref={bellRef}
        type="button"
        className="reminders__bell"
        aria-expanded={open}
        aria-controls="reminders-panel"
        aria-label={label}
        onClick={() => onOpenChange(!open)}
      >
        <BellIcon />
        {count > 0 && (
          <span className="reminders__badge num" aria-hidden="true">
            {count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="reminders__backdrop" onClick={() => onOpenChange(false)} aria-hidden="true" />
          <Panel
            reminders={reminders}
            bellRef={bellRef}
            onClose={() => onOpenChange(false)}
            onAction={(item) => {
              onOpenChange(false);
              onAction(item);
            }}
          />
        </>
      )}
    </div>
  );
}
