// Crew roster and header details for the demo.
// data/crew.json is the single source of truth for crew ids, names and roles; this file only
// picks who is logged in and adds the mission length, which crew.json does not hold.
import crewData from '../data/crew.json';

/** The logged-in crew member. Must be an id in data/crew.json. */
export const CURRENT_CREW_ID = 'crew-01';
export const TOTAL_MISSION_DAYS = 180;

/** Every crew member, as { id, name, role }, in crew.json order. */
export const crewRoster = crewData.crew.map(({ id, name, role }) => ({ id, name, role }));

/** The header details for one crew member, or null for an unknown id. */
export function crewMemberFor(crewId) {
  const person = crewData.crew.find((c) => c.id === crewId);
  if (!person) return null;
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    // The latest recorded day in crew.json.
    missionDay: person.days.at(-1).missionDay,
    totalMissionDays: TOTAL_MISSION_DAYS,
  };
}

export const crewMember = crewMemberFor(CURRENT_CREW_ID);
if (!crewMember) throw new Error(`CURRENT_CREW_ID "${CURRENT_CREW_ID}" is not in data/crew.json`);
