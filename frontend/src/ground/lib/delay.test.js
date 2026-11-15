// Signal delay model. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProfile } from '../../constants/mission.js';
import { PROFILE_KEY, arrivedOnEarthAt, arrivesOnboardAt, delayLabel, durationText, oneWayMs, profileFrom, sentText, timesText } from './delay.js';
import { memoryStorage } from './testFixtures.js';

const AT = '2026-10-31T14:02:00.000Z';
const iss = getProfile('iss');
const moon = getProfile('moon');
const mars = getProfile('mars');

test('one-way delay comes from constants/mission.js for each profile', () => {
  assert.equal(oneWayMs(iss), iss.delaySeconds * 1000);
  assert.equal(oneWayMs(moon), moon.delaySeconds * 1000);
  assert.equal(oneWayMs(mars), mars.delaySeconds * 1000);
});

test('ISS: arrival equals the recorded / sent time', () => {
  assert.equal(arrivedOnEarthAt(AT, iss), AT);
  assert.equal(arrivesOnboardAt(AT, iss), AT);
  assert.equal(timesText(AT, iss), 'Recorded 14:02 onboard · reached Earth 14:02 (UTC)');
});

test('Moon: 1.3 s each way, shown with seconds', () => {
  assert.equal(arrivedOnEarthAt(AT, moon), '2026-10-31T14:02:01.300Z');
  assert.equal(arrivesOnboardAt(AT, moon), '2026-10-31T14:02:01.300Z');
  assert.equal(timesText(AT, moon), 'Recorded 14:02:00 onboard · reached Earth 14:02:01 (UTC)');
});

test('Mars: the profile delay (20 min) each way', () => {
  assert.equal(arrivedOnEarthAt(AT, mars), '2026-10-31T14:22:00.000Z');
  assert.equal(arrivesOnboardAt(AT, mars), '2026-10-31T14:22:00.000Z');
  assert.equal(timesText(AT, mars), 'Recorded 14:02 onboard · reached Earth 14:22 (UTC)');
  assert.equal(sentText(AT, mars), 'Sent 14:02 · reaches crew 14:22 (UTC)');
  assert.equal(delayLabel(mars), 'Mars transit · signal about 20 min one way');
});

test('an arrival after midnight shows its date', () => {
  assert.equal(timesText('2026-10-31T23:50:00.000Z', mars), 'Recorded 23:50 onboard · reached Earth 1 Nov 00:10 (UTC)');
});

test('the profile is read from ahm.missionProfile.v1, with ISS as the fallback', () => {
  assert.equal(profileFrom(memoryStorage({ [PROFILE_KEY]: JSON.stringify('mars') })).id, 'mars');
  assert.equal(profileFrom(memoryStorage({ [PROFILE_KEY]: JSON.stringify('venus') })).id, 'iss');
  assert.equal(profileFrom(memoryStorage({ [PROFILE_KEY]: '{bad' })).id, 'iss');
  assert.equal(profileFrom(memoryStorage()).id, 'iss');
  assert.equal(profileFrom(null).id, 'iss');
});

test('bad times give null, durations read naturally', () => {
  assert.equal(arrivedOnEarthAt('not a time', mars), null);
  assert.equal(durationText(0), '0 s');
  assert.equal(durationText(1300), '1.3 s');
  assert.equal(durationText(20 * 60_000), '20 min');
  assert.equal(durationText(65 * 60_000), '1 h 5 min');
});
