// Server-side access to the seeded stand tests (src/data/standtests.json). Read only.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), 'src', 'data', 'standtests.json');

let cache = null;

function load() {
  if (!cache) cache = JSON.parse(readFileSync(FILE, 'utf8'));
  return cache;
}

export const getStandTestFile = () => load();

export const getStandTests = (crewId) => load().tests.filter((t) => crewId === undefined || t.crew_id === crewId);

/** The person's preflight tests, oldest first. */
export const getPreflightTests = (crewId) =>
  getStandTests(crewId)
    .filter((t) => t.phase === 'preflight')
    .sort((a, b) => a.day_offset - b.day_offset);
