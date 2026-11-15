import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSION_PROFILES, getProfile } from '../constants/mission.js';
import { HOWTO_SCREENS, contextLine, environmentFacts, environmentRules } from './environmentRules.js';

const UNAVAILABLE = 'Standing up has no effect in weightlessness. Do this test on landing day or at a surface base.';
const STRAP = 'Strap in or hold a handrail before measuring.';
const SIT = 'Sit still for 5 minutes before measuring.';
const REALTIME = 'Mission control can help right away.';
const SECONDS = 'Mission control answers within seconds; follow the CMO’s lead.';
const MINUTES = 'Help from Earth takes at least 20 min each way. The CMO leads; don’t wait for Earth in an emergency.';

const EXPECTED = {
  iss: { stand: false, howTo: STRAP, escalation: REALTIME, sample: false },
  lunar_transit: { stand: false, howTo: STRAP, escalation: SECONDS, sample: true },
  moon: { stand: true, gravity: '0.17 g', howTo: SIT, escalation: SECONDS, sample: true },
  mars: { stand: false, howTo: STRAP, escalation: MINUTES, sample: true },
  mars_surface: { stand: true, gravity: '0.38 g', howTo: SIT, escalation: MINUTES, sample: true },
};

for (const p of MISSION_PROFILES) {
  test(`environmentRules(${p.id})`, () => {
    const e = EXPECTED[p.id];
    const r = environmentRules(p);
    assert.deepEqual(r.standTest, e.stand ? { available: true, gravity: e.gravity } : { available: false, reason: UNAVAILABLE });
    assert.equal(r.howTo, e.howTo);
    assert.equal(r.escalation, e.escalation);
    assert.deepEqual(
      r.stationData,
      e.sample
        ? { sample: true, chip: 'Sample: ISS data', title: 'Habitat environment' }
        : { sample: false, chip: null, title: 'Station environment' },
    );
    assert.deepEqual(environmentRules(p.id), r, 'an id gives the same rules as the profile');
  });
}

test('an unknown or missing profile gets the ISS rules', () => {
  assert.deepEqual(environmentRules('venus'), environmentRules('iss'));
  assert.deepEqual(environmentRules(undefined), environmentRules('iss'));
});

test('the how-to line is for blood pressure, heart rate and temperature only', () => {
  assert.deepEqual(HOWTO_SCREENS, ['blood_pressure', 'heart_rate', 'temperature']);
});

test('the Today context line', () => {
  assert.equal(contextLine('moon'), 'Moon base · 0.17 g · Earth answers in about 1.3 s · help is days away');
  assert.equal(contextLine('iss'), 'Space station (low Earth orbit) · 0 g · Earth answers in near real time · help is hours away');
  assert.equal(contextLine('lunar_transit'), 'Spacecraft to the Moon · 0 g · Earth answers in about 1.3 s · help is days away');
  assert.equal(contextLine('mars'), 'Spacecraft to Mars · 0 g · Earth answers in about 20 min · help is months away');
  assert.equal(contextLine('mars_surface'), 'Mars base · 0.38 g · Earth answers in about 20 min · help is months away');
});

test('the header chip labels', () => {
  assert.deepEqual(
    MISSION_PROFILES.map((p) => p.shortLabel),
    ['Station · 0 g', 'To the Moon · 0 g', 'Moon base · 0.17 g', 'To Mars · 20 min delay', 'Mars base · 0.38 g'],
  );
});

test('panel facts: weightless has no source, surface gravity is cited, delay is approximate, help and radiation are team-set', () => {
  const iss = Object.fromEntries(environmentFacts('iss').map((f) => [f.id, f]));
  assert.deepEqual(Object.keys(iss), ['setting', 'gravity', 'delay', 'help', 'radiation']);
  assert.equal(iss.gravity.value, 'Weightless');
  assert.equal(iss.gravity.source, null);
  assert.deepEqual(iss.delay.source, { label: 'Approximate; changes with distance' });
  assert.equal(iss.help.source, 'team');
  assert.equal(iss.radiation.source, 'team');

  const mars = Object.fromEntries(environmentFacts(getProfile('mars_surface')).map((f) => [f.id, f]));
  assert.equal(mars.setting.value, 'Surface base');
  assert.equal(mars.gravity.value, 'About 0.38 g');
  assert.equal(mars.gravity.source, 'nasa_planetary_facts');
  assert.equal(mars.radiation.value, 'Thin atmosphere, partial shelter');
  assert.equal(mars.help.value, 'Months');
});
