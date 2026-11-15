// Who may look at whose data. One rule, used by the header menu, the crew page and App.jsx's
// viewing state: crew see only their own data; the Crew Medical Officer may view anyone's, read only,
// still signed in as herself. The server enforces the same rule on its own (RLS + /api routes).

import { DEMO_ACCOUNT_LIST } from './demoAccounts.js';

/** Every crew id the app knows, in crew.json order. */
export const CREW_IDS = Object.freeze(DEMO_ACCOUNT_LIST.map((a) => a.crewId));

/** The CMO's crew page ("Crew overview"): a view value, not a crew id. */
export const OVERVIEW = 'overview';

/** Only the Crew Medical Officer may look at other people's data. */
export const canViewOthers = (role) => role === 'cmo';

/** Your own id always; any known crew id when you are the CMO. */
export function canView(viewerId, viewerRole, targetId, knownIds = CREW_IDS) {
  if (!viewerId || !targetId) return false;
  if (targetId === viewerId) return true;
  return canViewOthers(viewerRole) && knownIds.includes(targetId);
}

/**
 * The view to show for a requested (possibly stale or forged) value. Crew always get their own id.
 * The CMO gets the request when it is the crew page or someone she may view, else the crew page.
 */
export function resolveViewedId({ viewerId, viewerRole, requested, knownIds = CREW_IDS }) {
  if (!canViewOthers(viewerRole)) return viewerId;
  if (requested === OVERVIEW) return OVERVIEW;
  return canView(viewerId, viewerRole, requested, knownIds) ? requested : OVERVIEW;
}
