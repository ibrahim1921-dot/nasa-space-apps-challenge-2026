// Main dashboard cards, body map and overall score per person. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OVERALL_RULE, REGION_READINGS, buildPersonDashboard, overallReason, overallScore } from './personCards.js';
import { crewFile } from './testSupport.js';

const person = (id) => crewFile.crew.find((c) => c.id === id);
const dashFor = (id, saved = []) => {
  const p = person(id);
  return buildPersonDashboard({ crewId: id, crewDays: p.days, preflight: p.preflight, saved });
};
const lastDay = (id) => [...person(id).days].sort((a, b) => a.day - b.day).at(-1);
const last14 = (id, key) => [...person(id).days].sort((a, b) => a.day - b.day).slice(-14).map((d) => d[key]);
const SEV = { normal: 0, watch: 1, alert: 2 };

test('a manual check-in preserves the last blood pressure card and status without restamping it', () => {
  const before = dashFor('crew-01');
  const saved = {
    crew_id: 'crew-01', recorded_at: '2099-01-01T08:00:00Z',
    payload: { reading: { heart_rate: 70 }, result: { indicators: {
      heart_rate: { id: 'heart_rate', value: 70, status: 'normal', reasons: [], unit: 'bpm' },
    } } },
  };
  const after = dashFor('crew-01', [saved]);
  assert.deepEqual(after.cardsById['blood-pressure'], before.cardsById['blood-pressure']);
  assert.equal(after.statuses.blood_pressure, before.statuses.blood_pressure);
});

for (const id of ['crew-01', 'crew-03']) {
  test(`${person(id).name}: sleep, BP, HR and reaction time come from their own latest crew.json row`, () => {
    const d = dashFor(id);
    const day = lastDay(id);
    const c = d.cardsById;
    assert.equal(c.sleep.value, day.sleepHours.toFixed(1));
    assert.equal(c['blood-pressure'].value, `${day.systolic}/${day.diastolic}`);
    assert.equal(c['heart-rate'].value, String(day.heartRate));
    assert.equal(c['reaction-time'].value, day.reactionMs);
    assert.equal(c['core-temperature'].value, day.temperature.toFixed(1));
    assert.equal(c.mood.value, String(day.mood));
    // Sparklines: their own last 14 days.
    assert.deepEqual(c.sleep.history, last14(id, 'sleepHours'));
    assert.deepEqual(c['blood-pressure'].history, last14(id, 'systolic'));
    assert.deepEqual(c['heart-rate'].history, last14(id, 'heartRate'));
    assert.deepEqual(c['reaction-time'].history, last14(id, 'reactionMs'));
    // Preflight average: their own preflight list.
    const pre = person(id).preflight;
    const mean = pre.reduce((s, x) => s + x.sleepHours, 0) / pre.length;
    assert.equal(c.sleep.preflightAverage.text, `Preflight average: ${mean.toFixed(1)} h`);
    // Nothing on the main cards is sample.
    assert.ok(d.cards.every((x) => x.sample === false), 'no main card is sample');
    assert.equal(d.cards.length, 6);
  });

  test(`${person(id).name}: body-map regions are the worst of their own readings; temperature drives Whole body`, () => {
    const d = dashFor(id);
    for (const [region, keys] of Object.entries(REGION_READINGS)) {
      const expected = keys.map((k) => d.statuses[k]).reduce((w, s) => (SEV[s] > SEV[w] ? s : w), 'normal');
      assert.equal(d.regions[region], expected, region);
    }
    assert.equal(d.regions.wholeBody, d.statuses.temperature);
    assert.equal('limbs' in d.regions, false, 'Bones and muscles is not computed: it stays sample');
    assert.equal(d.statuses.sleep_hours, d.cardsById.sleep.status);
    assert.equal(d.statuses.reaction, d.cardsById['reaction-time'].status);
  });

  test(`${person(id).name}: overall score follows the stated rule over their own 7 readings`, () => {
    const d = dashFor(id);
    const values = Object.values(d.statuses);
    assert.equal(values.length, 7);
    const watch = values.filter((s) => s === 'watch').length;
    const alert = values.filter((s) => s === 'alert').length;
    assert.equal(d.overall.score, Math.max(0, 100 - 10 * watch - 30 * alert));
    assert.equal(d.overall.reason, overallReason(d.statuses));
  });
}

test('Maya and Lena get different values on every main card except where crew.json itself is equal', () => {
  const maya = dashFor('crew-01').cardsById;
  const lena = dashFor('crew-03').cardsById;
  for (const id of ['sleep', 'reaction-time', 'blood-pressure', 'heart-rate', 'core-temperature']) {
    assert.notEqual(maya[id].value, lena[id].value, id);
  }
  // Both logged mood 4 on 30 Oct; their sparklines still differ.
  assert.equal(lastDay('crew-01').mood, lastDay('crew-03').mood);
  assert.notDeepEqual(maya.mood.history, lena.mood.history);
  assert.notEqual(dashFor('crew-01').overall.score, dashFor('crew-03').overall.score);
});

test('overall rule: −10 per watch, −30 per alert, clamped, status from the score bar bands', () => {
  assert.deepEqual(OVERALL_RULE, { start: 100, watch: 10, alert: 30, normalFrom: 75, watchFrom: 50 });
  assert.deepEqual(overallScore({ sleep_hours: 'normal' }), { score: 100, status: 'normal' });
  assert.deepEqual(overallScore({ sleep_hours: 'watch', mood: 'watch' }), { score: 80, status: 'normal' });
  assert.deepEqual(overallScore({ blood_pressure: 'alert' }), { score: 70, status: 'watch' });
  assert.deepEqual(overallScore({ blood_pressure: 'alert', temperature: 'alert' }), { score: 40, status: 'alert' });
  const all = { sleep_hours: 'alert', blood_pressure: 'alert', heart_rate: 'alert', glucose: 'alert', temperature: 'alert', mood: 'alert', reaction: 'alert' };
  assert.equal(overallScore(all).score, 0);
  assert.equal(overallReason({ blood_pressure: 'alert', sleep_hours: 'watch', reaction: 'watch' }), 'Blood pressure is on alert; sleep and reaction time are on watch.');
});

test('a newer check-in overrides the crew record: value, status, last sparkline point; reaction time stays from crew.json', () => {
  const before = dashFor('crew-01');
  const reading = { systolic: 142, diastolic: 91, heart_rate: 84, glucose: 99, temperature: 37.2, sleep_hours: 5.2, mood: 2 };
  const result = {
    indicators: {
      blood_pressure: { id: 'blood_pressure', value: { systolic: 142, diastolic: 91 }, status: 'alert', reasons: ['Systolic high'], usual: null },
      heart_rate: { id: 'heart_rate', value: 84, status: 'watch', reasons: ['HR up'], usual: null },
      glucose: { id: 'glucose', value: 99, status: 'normal', reasons: [], usual: null },
      temperature: { id: 'temperature', value: 37.2, status: 'normal', reasons: [], usual: null },
      sleep_hours: { id: 'sleep_hours', value: 5.2, status: 'watch', reasons: ['Short sleep'], usual: null },
      mood: { id: 'mood', value: 2, status: 'watch', reasons: ['Low mood'], usual: null },
    },
  };
  const saved = [{ id: 'c1', recorded_at: '2026-11-13T07:00:00.000Z', payload: { reading, result } }];
  const d = dashFor('crew-01', saved);
  const c = d.cardsById;
  assert.equal(c['blood-pressure'].value, '142/91');
  assert.equal(c['blood-pressure'].status, 'alert');
  assert.equal(c.sleep.value, '5.2');
  assert.equal(c.sleep.history.at(-1), 5.2);
  assert.equal(c['heart-rate'].history.at(-1), 84);
  assert.equal(c.sleep.history.length, 14);
  assert.match(c.sleep.sourceNote, /^Your check-in/);
  assert.equal(c['reaction-time'].value, before.cardsById['reaction-time'].value, 'reaction time is not in the check-in');
  assert.equal(d.regions.chest, 'alert');
  assert.equal(d.overall.score, 100 - 30 - 10 * 3);
  assert.equal(d.overall.changeSinceYesterday, d.overall.score - before.overall.score);
  // An older saved check-in does not override the crew record.
  const old = dashFor('crew-01', [{ ...saved[0], recorded_at: '2026-01-01T00:00:00.000Z' }]);
  assert.equal(old.cardsById['blood-pressure'].value, before.cardsById['blood-pressure'].value);
});
