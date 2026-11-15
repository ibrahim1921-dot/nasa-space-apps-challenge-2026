// The bundled data files for the ground console. Imported with JSON import attributes (as
// lib/provenance.js does), so the same module runs in Next and under node:test. data/bundled.js is
// not used here: its plain JSON imports do not load in Node.

import crewFile from '../../data/crew.json' with { type: 'json' };
import standFile from '../../data/standtests.json' with { type: 'json' };
import environmentFile from '../../data/environment.json' with { type: 'json' };
import { seedAll } from '../../lib/seedRows.js';

export { crewFile, standFile, environmentFile };

/** The person's crew.json days, oldest first (same as data/bundled.js crewDaysOf). */
export const crewDaysOf = (crewId) => {
  const person = crewFile.crew.find((c) => c.id === crewId);
  return person ? [...person.days].sort((a, b) => a.day - b.day) : [];
};

/** The last crew.json day and its mission day (same as hooks/useDemo.js). */
const lastDays = crewFile.crew.map((c) => [...c.days].sort((a, b) => a.day - b.day).at(-1));
export const LAST_CREW_DATE = lastDays.map((d) => d.date).sort().at(-1);
export const LAST_MISSION_DAY = Math.max(...lastDays.map((d) => d.missionDay ?? 0));

let seed = null;
/**
 * The seeded database built from the bundled files, exactly as the Crew tab's device mode builds it
 * (views/CrewMedicalOfficer.jsx getDeviceSeed): seed keys become record ids. Computed once.
 */
export function deviceSeed() {
  if (!seed) {
    const s = seedAll(crewFile, standFile);
    seed = { crew: s.crew, baselines: s.baselines, readings: s.readings.map(({ key, ...r }) => ({ id: key, ...r })) };
  }
  return seed;
}
