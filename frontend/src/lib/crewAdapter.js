// Backend crew profiles → the frontend's crew view.
//
// The backend (docs/astronaut-api-phase3.md) returns { astronautId (UUID), crewCode, displayName } and,
// for single profiles, createdAt/archivedAt. The frontend's bundled records (data/crew.json) are keyed by
// 'crew-01'..'crew-04'. The provisioned demo roster (docs/demo-account-provisioning.md) uses exactly
// those crew codes, so crewCode IS the frontend crewId: no separate mapping table is needed.
// astronautId is kept separately because every UUID route (/api/crew/{id}, alerts, baselines) needs it.
// Mission job titles ("Flight engineer") are not part of the backend API; they come from the local
// crew.json and are labelled as such.

import crewData from '../data/crew.json' with { type: 'json' };

const LOCAL = new Map(crewData.crew.map((c) => [c.id, c]));

/** Does this crew code have bundled (synthetic) records on this device? */
export const hasLocalRecords = (crewCode) => LOCAL.has(crewCode);

/** One backend profile → { crewId, astronautId, name, title, titleSource, hasLocalData, archivedAt }. */
export function toCrewView(profile) {
  if (!profile || typeof profile.crewCode !== 'string') return null;
  const local = LOCAL.get(profile.crewCode);
  return {
    crewId: profile.crewCode,
    astronautId: profile.astronautId ?? null,
    name: profile.displayName || local?.name || profile.crewCode,
    title: local?.role ?? null,
    titleSource: local ? 'local' : null,
    hasLocalData: Boolean(local),
    archivedAt: profile.archivedAt ?? null,
  };
}

/** Roster (sorted by crew code, as the backend returns it) → crew views, invalid rows dropped. */
export const toCrewViews = (roster) => (Array.isArray(roster) ? roster.map(toCrewView).filter(Boolean) : []);

/** astronautId → display name, for alert lists that only carry the UUID. */
export function nameIndex(views) {
  return new Map(views.filter((v) => v.astronautId).map((v) => [v.astronautId, v.name]));
}
