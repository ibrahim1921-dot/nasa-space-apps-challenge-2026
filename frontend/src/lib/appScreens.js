
/**
 * Defines the screens and navigation tabs available
 * to each account type.
 *
 * Regular crew members keep their existing navigation.
 * Medical officers get a crew-wide Dashboard and
 * an expandable My Data section.
 */

// Regular crew member navigation.
export const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sleep', label: 'Sleep & recovery' },
  { id: 'labs', label: 'Lab baseline' },
  { id: 'environment', label: 'Environment' },
  { id: 'standtest', label: 'Stand test' },
  { id: 'about', label: 'About' },
];

// Medical officer personal health screens.
// These appear INSIDE the expandable My Data section.
export const MY_DATA_SCREENS = [
  { id: 'mydata', label: 'Health Overview' },
  { id: 'sleep', label: 'Sleep & Recovery' },
  { id: 'labs', label: 'Lab Baseline' },
  { id: 'standtest', label: 'Stand Test' },
];

// Main navigation for medical officers.
export const MEDICAL_OFFICER_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'mydata', label: 'My Data' },
  { id: 'environment', label: 'Environment' },
  { id: 'about', label: 'About' },
];

/**
 * Determines whether to show the loading screen,
 * landing screen, or main application.
 */
export function screenFor({ ready, who }) {
  if (!ready) return 'loading';
  return who ? 'app' : 'landing';
}

/**
 * Returns the MAIN navigation for an account.
 *
 * Medical officer:
 * Dashboard | My Data | Environment | About
 *
 * Crew member:
 * Original personal navigation.
 */
export function tabsFor(account) {
  if (!account) return [];

  if (account.role === 'cmo') {
    return [...MEDICAL_OFFICER_TABS];
  }

  return [...TABS];
}

/**
 * Checks whether the account may open a screen.
 *
 * Medical officers can access the screens
 * nested inside My Data.
 *
 * Regular crew members retain their original access.
 *
 * The backend must separately enforce permissions
 * for whole-crew medical information.
 */
export function canOpen(account, viewId) {
  if (!account) return false;

  if (viewId === 'checkin') {
    return true;
  }

  if (account.role === 'cmo') {
    return (
      MEDICAL_OFFICER_TABS.some(
        (tab) => tab.id === viewId
      ) ||
      MY_DATA_SCREENS.some(
        (screen) => screen.id === viewId
      )
    );
  }

  return TABS.some(
    (tab) => tab.id === viewId
  );
}
