// Read-only emergency view for the ground console. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProfile } from '../../constants/mission.js';
import { EMERGENCY_KEY, aboutCrew, bandFor, handoffText, listEmergencies, openList, recentList, timelineRows, viewOf } from './emergencyView.js';
import { emergency, memoryStorage } from './testFixtures.js';

const NOW = Date.parse('2026-11-14T10:10:00.000Z');
const open = emergency({
  id: 'em-open',
  started: '2026-11-14T10:00:00.000Z',
  events: [{ id: 'e1', at: '2026-11-14T10:01:30.000Z', type: 'note', by: 'Lena Kowalski', detail: 'Pain eased' }],
});
const drill = emergency({ id: 'em-drill', patient: 'crew-04', started: '2026-11-14T09:00:00.000Z', drill: true });
const ended = emergency({ id: 'em-ended', started: '2026-11-12T09:00:00.000Z', ended: '2026-11-12T09:20:00.000Z' });
const old = emergency({ id: 'em-old', started: '2026-10-01T09:00:00.000Z', ended: '2026-10-01T09:20:00.000Z' });

test('reads ahm.emergency.v1 through lib/emergency.js', () => {
  const storage = memoryStorage({ [EMERGENCY_KEY]: JSON.stringify([open, drill, ended, { junk: true }]) });
  assert.deepEqual(listEmergencies(storage).map((e) => e.id), ['em-open', 'em-drill', 'em-ended']);
  assert.deepEqual(listEmergencies(memoryStorage()), []);
});

test('open, recent (7 days) and per-crew lists', () => {
  const list = [open, drill, ended, old];
  assert.deepEqual(openList(list).map((e) => e.id), ['em-open', 'em-drill']);
  assert.deepEqual(recentList(list, NOW).map((e) => e.id), ['em-ended']);
  assert.deepEqual(aboutCrew(list, 'crew-04').map((e) => e.id), ['em-drill']);
});

test('band: none when nothing is open; real outranks drill; drill alone is a drill band', () => {
  assert.equal(bandFor([ended], NOW), null);
  const band = bandFor([drill, open], NOW);
  assert.equal(band.kind, 'real');
  assert.equal(band.id, 'em-open');
  assert.equal(band.count, 2);
  assert.match(band.text, /^Emergency · Tomas · chest pain · started 10 min ago by Maya$/);
  const d = bandFor([drill], NOW);
  assert.equal(d.kind, 'drill');
  assert.match(d.text, /DRILL/);
});

test('timeline rows say when and who logged each event', () => {
  assert.deepEqual(timelineRows(open), [
    { id: 'em-open-e0', at: '2026-11-14T10:00:00.000Z', since: '+00:00', label: 'Emergency started', by: 'Maya Okafor', detail: null },
    { id: 'e1', at: '2026-11-14T10:01:30.000Z', since: '+01:30', label: 'Note', by: 'Lena Kowalski', detail: 'Pain eased' },
  ]);
  const v = viewOf(open);
  assert.equal(v.patientName, 'Tomas Reyes');
  assert.equal(v.open, true);
  assert.equal(v.cmoIsPatient, false);
});

test('handoff summary is summaryText with the profile delay', () => {
  const text = handoffText(open, { timeline: [], today: '2026-10-31', seededCount: 0, profile: getProfile('mars') });
  assert.match(text, /EMERGENCY HANDOFF SUMMARY/);
  assert.match(text, new RegExp(`Signal delay to Earth: ${getProfile('mars').delayText.replace(/[()]/g, '.')}`));
  assert.match(text, /Pain eased · Lena/);
});
