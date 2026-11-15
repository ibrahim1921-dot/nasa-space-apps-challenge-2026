// Which screen and which tabs a visitor gets. Pure, so the rules are tested in node:test and App.jsx
// only renders what these return.
//
// Three kinds of account (lib/session.js):
//   'crew'    astronaut                       personal tabs
//   'cmo'     astronaut Lena (crew-03), the   whole-crew dashboard first, her own data grouped under
//             onboard Crew Medical Officer    "My data" (teammate layout from b87d574)
//   'officer' backend NASA_OFFICER: a ground  live crew roster, alerts, baselines, rules; no personal
//             account with no astronaut link  data (the backend gives officers no astronaut profile)
// The backend enforces the real permissions; these only decide what is shown.

const item = (id, label) => ({ id, label });

const SHARED_MORE = [item('knowledge', 'Knowledge hub'), item('assessment', 'ML assessment')];

// Crew: main tabs kept short; the views used less often sit under "More".
export const MORE_ITEMS = [
  item('alerts', 'My alerts'),
  ...SHARED_MORE,
  item('activities', 'Activities'),
  item('labs', 'Lab baseline'),
  item('standtest', 'Stand test'),
  item('about', 'About'),
  item('demo', 'Demo controls'),
];

export const MORE_TAB = { id: 'more', label: 'More', items: MORE_ITEMS };

export const TABS = [item('dashboard', 'Today'), item('vitals', 'Vitals'), item('sleep', 'Sleep'), item('environment', 'Station'), MORE_TAB];

export const CMO_TAB = item('cmo', 'Crew');

// Lena: her personal screens, grouped (teammate change b87d574 "My Data").
export const MY_DATA_SCREENS = [item('dashboard', 'Today'), item('vitals', 'Vitals'), item('sleep', 'Sleep'), item('labs', 'Lab baseline'), item('standtest', 'Stand test')];
export const MY_DATA_TAB = { id: 'mydata', label: 'My data', items: MY_DATA_SCREENS };
export const CMO_MORE_TAB = {
  id: 'more',
  label: 'More',
  items: [item('alerts', 'My alerts'), ...SHARED_MORE, item('activities', 'Activities'), item('about', 'About'), item('demo', 'Demo controls')],
};
export const CMO_TABS = [CMO_TAB, MY_DATA_TAB, item('environment', 'Station'), CMO_MORE_TAB];

// Ground medical officer (backend NASA_OFFICER).
export const OFFICER_TABS = [
  item('officerCrew', 'Crew'),
  item('officerAlerts', 'Alerts'),
  item('baselines', 'Baselines'),
  item('rules', 'Rules'),
  { id: 'more', label: 'More', items: [...SHARED_MORE] },
];

/**
 * 'loading' until the stored identity / backend session has been read (avoids flashing the landing
 * screen for someone already signed in), then 'landing' with no identity, else 'app'.
 */
export function screenFor({ ready, who }) {
  if (!ready) return 'loading';
  return who ? 'app' : 'landing';
}

export function tabsFor(account) {
  if (!account) return [];
  if (account.role === 'officer') return [...OFFICER_TABS];
  if (account.role === 'cmo') return [...CMO_TABS];
  return [...TABS];
}

/** The first screen after sign-in. */
export function homeFor(account) {
  if (account?.role === 'officer') return 'officerCrew';
  if (account?.role === 'cmo') return 'cmo';
  return 'dashboard';
}

/** May this account open this view? Only the CMO may open the exam form; officers never get check-ins. */
export const canOpen = (account, viewId) =>
  Boolean(account) &&
  ((viewId === 'checkin' && account.role !== 'officer') ||
    (viewId === 'exam' && account.role === 'cmo') ||
    tabsFor(account).some((t) => t.id === viewId || t.items?.some((i) => i.id === viewId)));
