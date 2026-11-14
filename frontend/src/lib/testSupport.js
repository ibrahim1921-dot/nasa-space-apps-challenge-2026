// Test helpers (Node only): the bundled data files.
import { readFileSync } from 'node:fs';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
export const crewFile = load('../data/crew.json');
export const standFile = load('../data/standtests.json');

export const crewDaysOf = (id) => [...crewFile.crew.find((c) => c.id === id).days].sort((a, b) => a.day - b.day);
export const preflightOf = (id) => standFile.tests.filter((t) => t.crew_id === id && t.phase === 'preflight');

let n = 0;
/** Deterministic UUIDs for tests. */
export const testUuid = () => {
  n += 1;
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
};

export const NOW = new Date('2026-11-13T12:00:00.000Z');
