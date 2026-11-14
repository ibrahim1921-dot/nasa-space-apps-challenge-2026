// Which screen and which tabs a visitor gets. Pure, so the rules are tested in node:test and App.jsx
// only renders what these return.

export const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sleep', label: 'Sleep & recovery' },
  { id: 'labs', label: 'Lab baseline' },
  { id: 'environment', label: 'Environment' },
  { id: 'standtest', label: 'Stand test' },
  { id: 'about', label: 'About' },
];

export const CMO_TAB = { id: 'cmo', label: 'Crew Medical Officer' };

/**
 * 'loading' until the stored identity has been read (avoids flashing the landing screen for someone
 * already signed in), then 'landing' with no identity, else 'app'.
 */
export function screenFor({ ready, who }) {
  if (!ready) return 'loading';
  return who ? 'app' : 'landing';
}

/** Everyone gets the personal tabs; only the Crew Medical Officer also gets the whole-crew CMO tab. */
export function tabsFor(account) {
  if (!account) return [];
  return account.role === 'cmo' ? [...TABS.slice(0, -1), CMO_TAB, TABS.at(-1)] : [...TABS];
}

/** May this account open this view? (The backend must enforce the same rule for whole-crew data.) */
export const canOpen = (account, viewId) => viewId === 'checkin' || tabsFor(account).some((t) => t.id === viewId);
