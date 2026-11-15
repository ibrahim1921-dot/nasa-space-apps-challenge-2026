import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAdminHealthOnce } from './clearAdminHealth.js';

test('admin reset clears old personal health and wellness while preserving astronaut records', () => {
  const keys = ['ahm.dailyVitals.v1', 'ahm.wellnessCheckins.v1', 'ahm.standTests.v1'];
  const map = new Map(keys.map((key) => [key, JSON.stringify([{ id: 'admin', crew_id: 'crew-03' }, { id: 'astronaut', crew_id: 'crew-01' }])]));
  const storage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
  assert.equal(clearAdminHealthOnce('crew-03', storage), true);
  for (const key of keys) assert.deepEqual(JSON.parse(map.get(key)), [{ id: 'astronaut', crew_id: 'crew-01' }]);
  storage.setItem(keys[0], JSON.stringify([{ id: 'new', crew_id: 'crew-03' }]));
  assert.equal(clearAdminHealthOnce('crew-03', storage), false);
  assert.equal(JSON.parse(map.get(keys[0]))[0].id, 'new');
});
