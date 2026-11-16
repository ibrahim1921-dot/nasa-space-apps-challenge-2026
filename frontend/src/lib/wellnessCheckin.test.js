import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_WELLNESS, toggleAnswer, validateWellness, makeWellnessRecord, readWellnessCheckins, writeWellnessCheckin, needsUrgentHelp } from './wellnessCheckin.js';

const complete = () => ({ ...INITIAL_WELLNESS, symptoms: ['none'], urgentSigns: ['none'], sleepQuality: 'rested', appetite: 'usual', hydration: 'usual', mood: 'okay', stress: 'manageable', workload: 'normal' });

test('none is exclusive and symptom selection is reversible', () => {
  assert.deepEqual(toggleAnswer(['none'], 'headache'), ['headache']);
  assert.deepEqual(toggleAnswer(['headache', 'pain'], 'none'), ['none']);
  assert.deepEqual(toggleAnswer(['headache'], 'headache'), []);
  assert.equal(needsUrgentHelp({ urgentSigns: ['breathing'] }), true);
  assert.equal(needsUrgentHelp({ urgentSigns: ['none'] }), false);
});

test('wellness answers validate without any measured readings and require symptom follow-ups only when applicable', () => {
  const answers = complete();
  for (const step of [0, 1, 2]) assert.deepEqual(validateWellness(answers, step), {});
  assert.ok(validateWellness({ ...answers, symptoms: [] }, 0).symptoms);
  assert.ok(validateWellness({ ...answers, symptoms: ['none', 'headache'] }, 0).symptoms);
  assert.ok(validateWellness({ ...answers, symptoms: ['headache'] }, 1).severity);
  assert.deepEqual(validateWellness({ ...answers, symptoms: ['headache'], severity: 'mild', onset: 'today', course: 'steady', impact: 'some' }, 1), {});
});

test('saving keeps wellness separate from vitals and drops irrelevant old symptom details', () => {
  const answers = { ...complete(), severity: 'severe', location: 'old pain' };
  const record = makeWellnessRecord('crew-01', answers);
  assert.equal(record.kind, 'wellness_checkin');
  assert.equal(record.answers.location, '');
  assert.equal(record.answers.severity, '');
  assert.equal(record.reading, undefined);
  assert.equal(record.status, undefined);
  assert.equal(record.answers.mood, 'okay');
  answers.symptoms.push('pain');
  assert.deepEqual(record.answers.symptoms, ['none']);
  assert.throws(() => makeWellnessRecord('', complete()), /Sign in/);
});

test('local wellness storage is crew-specific, survives reload, and reports storage failure', () => {
  const previous = globalThis.window;
  const data = new Map();
  globalThis.window = { localStorage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } };
  try {
    const one = makeWellnessRecord('crew-01', complete(), '2026-11-15T08:00:00Z');
    const two = makeWellnessRecord('crew-02', complete(), '2026-11-15T09:00:00Z');
    assert.equal(writeWellnessCheckin(one), true);
    assert.equal(writeWellnessCheckin(two), true);
    assert.deepEqual(readWellnessCheckins('crew-01').map((r) => r.id), [one.id]);
    assert.deepEqual(readWellnessCheckins('crew-02').map((r) => r.id), [two.id]);
    assert.equal([...data.keys()].length, 1);
    assert.ok([...data.keys()][0].includes('wellness'));
    globalThis.window.localStorage.setItem = () => { throw new Error('full'); };
    assert.equal(writeWellnessCheckin(one), false);
  } finally { globalThis.window = previous; }
});
