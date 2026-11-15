import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecordedDashboard } from './recordedHealth.js';
import { buildCrewCards, flaggedFeed } from './cmoSummary.js';
import { getRegionIndicators, getRegionStatuses, getRadiation } from '../services/healthService.js';

test('missing measurements never become normal status, a sample reading or a perfect health score', () => {
  const result = buildRecordedDashboard({ crewId: 'crew-01' });
  assert.equal(result.latest, null);
  assert.equal(result.overall, null);
  assert.deepEqual(result.statuses, {});
  assert.ok(Object.values(result.regions).every((status) => status === 'unknown'));
  assert.ok(result.cards.every((card) => card.missing && !card.sample && card.value === null && card.status === 'unknown'));
});

test('recorded readings remain available without seeded or other crew readings leaking in', () => {
  const make = (id, crew_id, origin) => ({ id, crew_id, kind: 'daily_vitals', recorded_at: '2026-11-15T08:00:00Z', status: 'alert', payload: { ...(origin ? { origin } : {}), reading: { heart_rate: 130 }, result: { indicators: { heart_rate: { id: 'heart_rate', value: 130, status: 'alert', reasons: ['Recorded high heart rate'], usual: null } } } } });
  const result = buildRecordedDashboard({ crewId: 'crew-01', saved: [make('real', 'crew-01'), make('seed', 'crew-01', 'seed'), make('other', 'crew-02')] });
  assert.equal(result.latest.id, 'real');
  assert.equal(result.cardsById['heart-rate'].value, '130');
  assert.equal(result.regions.chest, 'alert');
  assert.equal(result.cardsById['blood-pressure'].missing, true);
  assert.equal(result.observationHistory.length, 1);
});

test('crew with no recorded readings have unknown status and no fabricated alerts', () => {
  const cards = buildCrewCards({ crew: [{ id: 'crew-01', name: 'Crew member' }], readings: [], baselines: [] });
  assert.equal(cards[0].status, 'unknown');
  assert.deepEqual(flaggedFeed([]), []);
});

test('unconnected health services return empty data without calling sample APIs', async () => {
  assert.deepEqual(await getRegionIndicators('head'), []);
  assert.deepEqual(await getRegionStatuses(), {});
  assert.deepEqual((await getRadiation()).days, []);
});
