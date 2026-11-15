// Crew roster and header details for the demo.
// data/crew.json is the single source of truth for crew ids, names and roles; this file only adds
// the mission length, which crew.json does not hold. Who is signed in comes from the demo identity
// (lib/demoAccounts.js), never from a fixed id here.
import crewData from '../data/crew.json';

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
