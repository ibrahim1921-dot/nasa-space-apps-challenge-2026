import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILE_ID, MISSION_PROFILES, PROFILES_BY_ID, getProfile } from './mission.js';
import { ENVIRONMENT_BY_PROFILE, environmentFor } from '../lib/emergency.js';
import { ENVIRONMENTS, POSITIONS } from '../content/emergency.js';
import { sourceFor } from '../content/limits.js';
import { profileFrom, PROFILE_KEY } from '../ground/lib/delay.js';

const FIELDS = {
  id: 'string',
  label: 'string',
  gravityArrival: 'boolean',
  delaySeconds: 'number',
  delayText: 'string',
  title: 'string',
  shortLabel: 'string',
  setting: 'string',
  gravityG: 'number',
  signal: 'string',
  helpText: 'string',
  helpShort: 'string',
  helpSource: 'string',
  radiationText: 'string',
  radiationSource: 'string',
};

const memoryStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test('there are five environments, in order, with the three original ids kept', () => {
  assert.deepEqual(
    MISSION_PROFILES.map((p) => p.id),
    ['iss', 'lunar_transit', 'moon', 'mars', 'mars_surface'],
  );
  assert.equal(DEFAULT_PROFILE_ID, 'iss');
});

test('every profile has every field, with the right type and a known value', () => {
  for (const p of MISSION_PROFILES) {
    for (const [key, type] of Object.entries(FIELDS)) assert.equal(typeof p[key], type, `${p.id}.${key}`);
    assert.ok(['station', 'spacecraft', 'surface'].includes(p.setting), `${p.id}.setting`);
    assert.ok(['realtime', 'seconds', 'minutes'].includes(p.signal), `${p.id}.signal`);
    assert.ok('gravitySource' in p, `${p.id}.gravitySource`);
  }
});

test('the table values: titles, settings, gravity and help', () => {
  const rows = MISSION_PROFILES.map((p) => [p.id, p.title, p.setting, p.gravityG, p.signal, p.helpShort]);
  assert.deepEqual(rows, [
    ['iss', 'Space station (low Earth orbit)', 'station', 0, 'realtime', 'hours'],
    ['lunar_transit', 'Spacecraft to the Moon', 'spacecraft', 0, 'seconds', 'days'],
    ['moon', 'Moon base', 'surface', 0.17, 'seconds', 'days'],
    ['mars', 'Spacecraft to Mars', 'spacecraft', 0, 'minutes', 'months'],
    ['mars_surface', 'Mars base', 'surface', 0.38, 'minutes', 'months'],
  ]);
  assert.equal(getProfile('lunar_transit').delaySeconds, 1.3);
  assert.equal(getProfile('mars_surface').delaySeconds, getProfile('mars').delaySeconds);
  assert.equal(getProfile('mars_surface').delayText, getProfile('mars').delayText);
});

test('help times and radiation lines are team-set; gravity is cited on the surface profiles only', () => {
  for (const p of MISSION_PROFILES) {
    assert.equal(p.helpSource, 'team', p.id);
    assert.equal(p.radiationSource, 'team', p.id);
    if (p.gravityG === 0) assert.equal(p.gravitySource, null, p.id);
    else {
      assert.equal(p.gravitySource, 'nasa_planetary_facts', p.id);
      assert.equal(sourceFor(p.gravitySource).source_url, 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/');
      assert.equal(sourceFor(p.gravitySource).team_set, false);
    }
  }
});

test('the original ids keep their original fields (saved settings, emergency summary, ground console)', () => {
  assert.equal(getProfile('iss').label, 'ISS (low Earth orbit)');
  assert.equal(getProfile('iss').delaySeconds, 0);
  assert.equal(getProfile('moon').label, 'Moon base');
  assert.equal(getProfile('moon').delaySeconds, 1.3);
  assert.equal(getProfile('mars').label, 'Mars transit');
  assert.equal(getProfile('mars').delaySeconds, 20 * 60);
  assert.equal(getProfile('mars').gravityArrival, true);
  assert.equal(getProfile('moon').gravityArrival, true);
  assert.equal(getProfile('iss').gravityArrival, false);
});

test('Mars gravity behaviour lives on mars_surface: arrival in gravity, Mars label and the Mars delay', () => {
  const p = getProfile('mars_surface');
  assert.equal(p.gravityArrival, true);
  assert.equal(p.label, 'Mars base');
  assert.equal(p.gravityG, 0.38);
  assert.equal(p.delaySeconds, 20 * 60);
});

test('saved ids still load, old and new, under the same key; unknown ids fall back to the ISS', () => {
  assert.equal(PROFILE_KEY, 'ahm.missionProfile.v1');
  for (const id of ['iss', 'moon', 'mars', 'lunar_transit', 'mars_surface']) {
    assert.ok(id in PROFILES_BY_ID, id);
    assert.equal(getProfile(id).id, id);
    assert.equal(profileFrom(memoryStorage({ [PROFILE_KEY]: JSON.stringify(id) })).id, id);
  }
  assert.equal(getProfile('venus').id, 'iss');
});

test('emergency mapping for the new ids: lunar transit → spacecraft, Mars base → partial-gravity surface CPR', () => {
  assert.equal(environmentFor('lunar_transit'), 'spacecraft');
  assert.equal(environmentFor('mars_surface'), 'moon');
  assert.equal(ENVIRONMENTS.moon.label, 'Moon or Mars base (partial gravity)');
  for (const p of MISSION_PROFILES) assert.ok(ENVIRONMENTS[ENVIRONMENT_BY_PROFILE[p.id]], p.id);
  const kneel = POSITIONS.moon[0];
  assert.equal(kneel.source, 'team');
  assert.match(kneel.text, /In partial gravity \(one-sixth on the Moon, about a third on Mars\)/);
  assert.equal(kneel.note, 'The 2020 microgravity guideline does not cover partial gravity; this step is team-set.');
});
