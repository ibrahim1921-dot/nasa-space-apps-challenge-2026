// Stand-test engine tests. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CRITERIA, computeChanges, evaluateStandTest, validateStandTest } from './standTest.js';
import { STAND_TEST, limitOf } from '../content/limits.js';

const seeded = JSON.parse(readFileSync(new URL('../data/standtests.json', import.meta.url), 'utf8'));
const preflightFor = (crewId) => seeded.tests.filter((t) => t.crew_id === crewId && t.phase === 'preflight');
const find = (id) => seeded.tests.find((t) => t.id === id);
const evaluate = (t) => evaluateStandTest(t, preflightFor(t.crew_id));

const NORMAL = {
  supine: { heart_rate: 60, systolic: 115, diastolic: 75 },
  standing_1min: { heart_rate: 70, systolic: 112, diastolic: 77 },
  standing_3min: { heart_rate: 71, systolic: 113, diastolic: 78 },
  symptoms: [],
};

test('seed file: 4 crew x (L-180, L-90, R+0), labelled Synthetic', () => {
  assert.equal(seeded.source, 'Synthetic');
  assert.equal(seeded.tests.length, 12);
  for (const id of ['crew-01', 'crew-02', 'crew-03', 'crew-04']) {
    const points = seeded.tests.filter((t) => t.crew_id === id).map((t) => t.timepoint).sort();
    assert.deepEqual(points, ['L-180', 'L-90', 'R+0']);
  }
  for (const t of seeded.tests) {
    assert.equal(t.source, 'Synthetic');
    assert.equal(validateStandTest(t), null, `${t.id} should be valid`);
  }
});

test('the seeded abnormal R+0 test (crew-02) is alert', () => {
  const result = evaluate(find('st-crew-02-R+0'));
  console.log('crew-02 R+0:', JSON.stringify(result.changes), result.reasons);
  assert.equal(result.status, 'alert');
  assert.deepEqual(
    { systolic: result.changes.systolic, diastolic: result.changes.diastolic, heart_rate: result.changes.heart_rate },
    { systolic: -26, diastolic: -12, heart_rate: 34 },
  );
  assert.match(result.reasons.join(' '), /Systolic BP fell 26 mmHg on standing; before flight it fell 4\.5 mmHg/);
  assert.match(result.reasons.join(' '), /Symptoms reported: dizzy/);
});

test('every other seeded test is normal', () => {
  for (const t of seeded.tests.filter((x) => x.id !== 'st-crew-02-R+0')) {
    const result = evaluate(t);
    assert.equal(result.status, 'normal', `${t.id}: ${result.reasons.join(' | ')}`);
  }
});

test('a symptom alone gives watch', () => {
  const result = evaluateStandTest({ ...NORMAL, symptoms: ['blurred_vision'] }, preflightFor('crew-01'));
  assert.equal(result.status, 'watch');
  assert.match(result.reasons.join(' '), /Symptoms reported: blurred or dimmed vision/);
});

test('worst of the 1 and 3 min readings is used for each measure separately', () => {
  const c = computeChanges({
    supine: { heart_rate: 60, systolic: 120, diastolic: 80 },
    standing_1min: { heart_rate: 90, systolic: 110, diastolic: 78 },
    standing_3min: { heart_rate: 80, systolic: 114, diastolic: 74 },
  });
  assert.deepEqual(c, { systolic: -10, diastolic: -6, heart_rate: 30, worst_at: { systolic: '1min', diastolic: '3min', heart_rate: '1min' } });
});

test('general cut-offs: exactly at the limit counts, one below does not', () => {
  const at = (systolicDrop, diastolicDrop, hrRise) =>
    evaluateStandTest({
      supine: { heart_rate: 60, systolic: 130, diastolic: 85 },
      standing_1min: { heart_rate: 60 + hrRise, systolic: 130 - systolicDrop, diastolic: 85 - diastolicDrop },
      symptoms: [],
    }).status;
  const { alert, watch } = CRITERIA;
  assert.equal(at(alert.systolicDrop, 0, 0), 'alert');
  assert.equal(at(alert.systolicDrop - 1, 0, 0), 'watch');
  assert.equal(at(0, alert.diastolicDrop, 0), 'alert');
  assert.equal(at(0, 0, alert.hrRise), 'alert');
  assert.equal(at(0, 0, watch.hrRise), 'watch');
  assert.equal(at(watch.systolicDrop - 1, watch.diastolicDrop - 1, watch.hrRise - 1), 'normal');
});

test('personal rule: within general limits but clearly worse than own preflight gives watch', () => {
  // Preflight: HR rise -2, systolic rise +5. This test: HR rise 14, systolic drop 9 (both under general watch).
  const pre = [
    {
      id: 'p1',
      supine: { heart_rate: 70, systolic: 110, diastolic: 70 },
      standing_1min: { heart_rate: 68, systolic: 115, diastolic: 74 },
      symptoms: [],
    },
  ];
  const t = {
    supine: { heart_rate: 60, systolic: 120, diastolic: 76 },
    standing_1min: { heart_rate: 74, systolic: 111, diastolic: 76 },
    symptoms: [],
  };
  const result = evaluateStandTest(t, pre);
  assert.equal(result.status, 'watch');
  assert.match(result.reasons.join(' '), /Heart rate rose 14 bpm on standing; before flight it fell 2 bpm.*own preflight/);
  assert.match(result.reasons.join(' '), /Systolic BP fell 9 mmHg.*before flight it rose 5 mmHg/);
  // Without preflight history the same test is normal.
  assert.equal(evaluateStandTest(t, []).status, 'normal');
});

test('a stopped test with only a supine reading and "felt faint" is alert', () => {
  const result = evaluateStandTest(
    { supine: NORMAL.supine, standing_1min: null, standing_3min: null, symptoms: ['felt_faint'], partial: true },
    preflightFor('crew-01'),
  );
  assert.equal(result.status, 'alert');
  assert.equal(result.changes, null);
  assert.match(result.reasons[0], /stopped early/);
});

test('validation rejects out-of-range and malformed input', () => {
  assert.equal(validateStandTest(NORMAL), null);
  assert.match(validateStandTest({ ...NORMAL, supine: { ...NORMAL.supine, heart_rate: 240 } }), /expected 25–220 bpm/);
  assert.match(validateStandTest({ ...NORMAL, supine: { ...NORMAL.supine, systolic: 50 } }), /expected 60–250 mmHg/);
  assert.match(validateStandTest({ ...NORMAL, standing_3min: { ...NORMAL.standing_3min, diastolic: 20 } }), /expected 30–150 mmHg/);
  assert.match(validateStandTest({ ...NORMAL, supine: { ...NORMAL.supine, systolic: '115' } }), /must be a number/);
  assert.match(validateStandTest({ ...NORMAL, supine: null }), /supine is missing/);
  assert.match(validateStandTest({ ...NORMAL, standing_1min: null, standing_3min: null }), /needs a standing reading/);
  assert.match(validateStandTest({ ...NORMAL, symptoms: ['headache'] }), /unknown value "headache"/);
  assert.equal(validateStandTest({ supine: null, symptoms: ['felt_faint'], partial: true }), null);
});

test('"felt faint" alone gives alert, even with normal readings', () => {
  const result = evaluateStandTest({ ...NORMAL, symptoms: ['felt_faint'] }, preflightFor('crew-01'));
  assert.equal(result.status, 'alert');
  assert.match(result.reasons.join(' '), /Symptoms reported: felt faint/);
});

test('a stopped test gives alert even with no symptoms', () => {
  const result = evaluateStandTest({ ...NORMAL, standing_3min: null, partial: true }, preflightFor('crew-01'));
  assert.equal(result.status, 'alert');
  assert.match(result.reasons[0], /stopped early, which counts as alert/);
});

test('every other symptom still gives at least watch', () => {
  for (const s of ['dizzy', 'blurred_vision', 'nausea']) {
    assert.equal(evaluateStandTest({ ...NORMAL, symptoms: [s] }, preflightFor('crew-01')).status, 'watch', s);
  }
});

test('stand-test cut-offs are the ones in content/limits.js', () => {
  assert.deepEqual(CRITERIA, { alert: STAND_TEST.alert, watch: STAND_TEST.watch });
  assert.equal(limitOf('stand_systolic_drop', 'alert').team_set, false);
  assert.equal(limitOf('stand_systolic_drop', 'watch').team_set, true);
});
