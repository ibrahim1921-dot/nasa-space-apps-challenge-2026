// Test helpers (Node only): the bundled data files and an in-memory stand-in for the readings table
// that behaves like `INSERT … ON CONFLICT (id) DO NOTHING` and rejects updates (append-only).
import { readFileSync } from 'node:fs';
import { seedAll } from './seedRows.js';
import { createHash } from 'node:crypto';

/** Stable UUID (version-5 layout, SHA-1) for a seed row key (was in the removed Supabase seedSql.js). */
export function seedUuid(key) {
  const h = createHash('sha1').update(`ahm-seed/v1:${key}`).digest('hex');
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
export const crewFile = load('../data/crew.json');
export const standFile = load('../data/standtests.json');

export const crewDaysOf = (id) => [...crewFile.crew.find((c) => c.id === id).days].sort((a, b) => a.day - b.day);
export const preflightOf = (id) => standFile.tests.filter((t) => t.crew_id === id && t.phase === 'preflight');

const SEED_SYNCED_AT = '2026-11-01T00:00:00.000Z';

/** A fake readings table, pre-filled with the seed (as seed.sql would). */
export function fakeDb({ seeded = true } = {}) {
  const rows = new Map();
  if (seeded) {
    for (const r of seedAll(crewFile, standFile).readings) {
      const { key, ...rest } = r;
      rows.set(seedUuid(key), { id: seedUuid(key), ...rest, synced_at: SEED_SYNCED_AT });
    }
  }
  let inserts = 0;
  let clock = Date.parse('2026-11-13T12:00:00.000Z');
  const copy = (v) => JSON.parse(JSON.stringify(v));
  return {
    rows,
    get insertCalls() {
      return inserts;
    },
    async findByIds(ids) {
      return ids.filter((id) => rows.has(id)).map((id) => copy(rows.get(id)));
    },
    async dailyRows(crewId) {
      return [...rows.values()]
        .filter((r) => r.crew_id === crewId && r.kind === 'daily_vitals')
        .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))
        .map(copy);
    },
    async insert(row) {
      inserts += 1;
      if (rows.has(row.id)) return null; // ON CONFLICT (id) DO NOTHING
      clock += 1000;
      const stored = { ...copy(row), synced_at: new Date(clock).toISOString() };
      rows.set(row.id, stored);
      return copy(stored);
    },
    update() {
      throw new Error('readings is append-only');
    },
  };
}

let n = 0;
/** Deterministic UUIDs for tests. */
export const testUuid = () => {
  n += 1;
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
};

export const NOW = new Date('2026-11-13T12:00:00.000Z');
