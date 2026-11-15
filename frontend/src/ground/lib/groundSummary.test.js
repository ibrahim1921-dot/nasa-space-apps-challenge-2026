// The printable ground summary. Run with: npm test
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EMERGENCY_KEY } from '../../lib/emergency.js';
import { addDays } from '../../lib/sensorFeed.js';
import { createLocalGroundSource } from './groundSource.js';
import { LAST_CREW_DATE } from './data.js';
import { SUMMARY_DAYS, lastDays } from './groundSummary.js';
import { VITALS_KEY, emergency, exam, memoryStorage, useWindowStorage } from './testFixtures.js';

const REAL = new Date('2026-11-14T15:00:00.000Z');
const DAY1 = addDays(LAST_CREW_DATE, 1);
let storage;
let restore;

beforeEach(() => {
  storage = memoryStorage();
  restore = useWindowStorage(storage);
});
afterEach(() => restore());

const summary = (id = 'crew-02') => createLocalGroundSource({ storage, realNow: () => REAL }).summaryFor(id);

test('status and reasons, 7 days with provenance, exams and emergencies', () => {
  storage.setItem(VITALS_KEY, JSON.stringify([exam({ id: 'x1', crewId: 'crew-02', at: `${DAY1}T10:00:00.000Z`, reading: { heart_rate: 72, temperature: 36.9 }, note: 'Resting' })]));
  storage.setItem(
    EMERGENCY_KEY,
    JSON.stringify([
      emergency({ id: 'em-open', started: '2026-11-14T14:50:00.000Z' }),
      emergency({ id: 'em-old', started: '2026-10-01T09:00:00.000Z', ended: '2026-10-01T09:20:00.000Z' }),
    ]),
  );
  const { blocks, text } = summary();
  assert.match(blocks.title, /^Tomas Reyes \(crew-02\) · Commander$/);
  assert.equal(blocks.days.length, SUMMARY_DAYS);
  assert.equal(blocks.days.at(-1).date, DAY1);
  assert.ok(blocks.days.every((d) => d.items.every((i) => typeof i.provenance === 'string')));
  assert.ok(blocks.days.slice(0, -1).some((d) => d.items.some((i) => i.provenance === 'synthetic crew record')));
  assert.ok(blocks.days.at(-1).items.some((i) => /^CMO exam by Lena/.test(i.provenance)));
  assert.equal(blocks.exams.length, 1);
  assert.equal(blocks.exams[0].by, 'Lena Kowalski');
  assert.deepEqual(blocks.emergencies.map((e) => e.id), ['em-open']); // the October one is not recent
  assert.match(text, /^Status: (Normal|Watch|Alert)$/m);
  assert.match(text, /Last 7 days of readings:/);
  assert.match(text, /Note: Resting/);
  assert.match(text, /EMERGENCY HANDOFF SUMMARY/);
  assert.match(text, /Not a diagnosis/);
});

test('no exams or emergencies are said plainly; unknown crew gives null', () => {
  const { text } = summary('crew-01');
  assert.match(text, /CMO exams:\n- None on this device\./);
  assert.match(text, /Open and recent emergencies:\n- None\./);
  assert.equal(summary('crew-99'), null);
});

test('lastDays never goes past the demo today', () => {
  const timeline = [{ date: '2026-10-01', systolic: 110, diastolic: 70 }, { date: '2026-10-05', systolic: 111, diastolic: 71 }];
  assert.deepEqual(lastDays(timeline, { today: '2026-10-02' }).map((d) => d.date), ['2026-10-01']);
});
