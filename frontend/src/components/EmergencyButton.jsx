'use client';

import { useEmergency } from '../hooks/useEmergency.jsx';

/** Red cross-in-circle icon; the word "Emergency" always goes with it (never colour alone). */
export function EmergencyIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10 6.5h4v3.5h3.5v4H14v3.5h-4V14H6.5v-4H10z" fill="currentColor" />
    </svg>
  );
}

/** Always-visible Emergency button: one tap opens the guide. No confirm dialog, no network needed. */
export default function EmergencyButton({ className = '' }) {
  const { actions, all, view } = useEmergency();
  const open = all.find((e) => !e.ended_at && e.events.length);
  return (
    <button
      type="button"
      className={`emg-button ${className}`}
      onClick={() => (view?.id ? actions.show(view.mode, view.id) : actions.openStart())}
      aria-haspopup="dialog"
    >
      <EmergencyIcon />
      <span>Emergency</span>
      {open && <span className="sr-only"> (an emergency is open)</span>}
    </button>
  );
}
