// The data files bundled into the app, for scoring and fallbacks on the device when the
// onboard server cannot be reached. Same files the server reads, so results match.
import crewFile from './crew.json';
import standFile from './standtests.json';

export { crewFile, standFile };

export const crewDaysOf = (crewId) => {
  const person = crewFile.crew.find((c) => c.id === crewId);
  return person ? [...person.days].sort((a, b) => a.day - b.day) : [];
};

/** The person's preflight daily readings (the `preflight` list in crew.json), oldest first. */
export const preflightDaysOf = (crewId) => {
  const person = crewFile.crew.find((c) => c.id === crewId);
  return person ? [...person.preflight].sort((a, b) => a.day - b.day) : [];
};

export const preflightTestsOf = (crewId) =>
  standFile.tests.filter((t) => t.crew_id === crewId && t.phase === 'preflight').sort((a, b) => a.day_offset - b.day_offset);
