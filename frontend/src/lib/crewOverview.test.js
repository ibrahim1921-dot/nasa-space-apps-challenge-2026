// The CMO's crew page: card order and card lines. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastCheckinAt, openEmergencyPatients, orderCrewCards, topReason } from './crewOverview.js';

const cards = [
  { id: 'a', status: 'normal' },
  { id: 'b', status: 'watch' },
  { id: 'self', status: 'alert' },
  { id: 'c', status: 'alert' },
];
const ids = (list) => list.map((c) => c.id);

test('order: alert, watch, normal; the officer’s own card last even when worse', () => {
  assert.deepEqual(ids(orderCrewCards(cards, 'self')), ['c', 'b', 'a', 'self']);
});

test('order: an open emergency moves that person first, whatever their status', () => {
  assert.deepEqual(ids(orderCrewCards(cards, 'self', new Set(['a']))), ['a', 'c', 'b', 'self']);
  // Two emergencies: worst status first among them; ties keep the given order.
  assert.deepEqual(ids(orderCrewCards(cards, 'self', new Set(['a', 'b']))), ['b', 'a', 'c', 'self']);
});

test('order does not change the input array', () => {
  const copy = [...cards];
  orderCrewCards(cards, 'self', new Set(['a']));
  assert.deepEqual(cards, copy);
});

test('openEmergencyPatients lists only open emergencies with a patient', () => {
  const list = [
    { id: '1', patient_crew_id: 'crew-02', ended_at: null },
    { id: '2', patient_crew_id: 'crew-01', ended_at: '2026-11-15T10:00:00Z' },
    { id: '3', patient_crew_id: null, ended_at: null },
  ];
  assert.deepEqual([...openEmergencyPatients(list)], ['crew-02']);
  assert.equal(openEmergencyPatients().size, 0);
});

test('topReason keeps the worst clause, and a short line when all is in range', () => {
  assert.equal(topReason('Blood pressure is on alert; sleep and mood are on watch.'), 'Blood pressure is on alert.');
  assert.equal(topReason('Sleep is on watch.'), 'Sleep is on watch.');
  assert.equal(topReason('All 7 readings are within your limits and usual range.'), 'All readings within limits.');
  assert.equal(topReason(null), null);
});

test('lastCheckinAt skips simulated sensor days and falls back to the crew record', () => {
  const person = {
    crewRecord: { recorded_at: '2026-11-10T07:00:00Z' },
    entries: [
      { recorded_at: '2026-11-11T07:00:00Z' },
      { recorded_at: '2026-11-12T07:00:00Z', fromSensor: true },
    ],
  };
  assert.equal(lastCheckinAt(person), '2026-11-11T07:00:00Z');
  assert.equal(lastCheckinAt({ ...person, entries: [] }), '2026-11-10T07:00:00Z');
  assert.equal(lastCheckinAt({ entries: [] }), null);
});
