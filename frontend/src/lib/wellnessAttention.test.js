import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wellnessAttention } from './wellnessAttention.js';

const usual = { symptoms: ['none'], urgentSigns: ['none'], appetite: 'usual', hydration: 'usual', sleepQuality: 'rested', mood: 'okay', stress: 'manageable', workload: 'normal' };

test('urgent symptoms take priority over routine suggested checks', () => {
  const result = wellnessAttention({ ...usual, urgentSigns: ['chest'], sleepQuality: 'disrupted' });
  assert.equal(result.urgent, true);
  assert.match(result.title, /now/);
  assert.equal(result.checks.length, 1);
  assert.match(result.checks[0], /Do not wait/);
});

test('suggestions reflect reported symptoms without changing answers or scoring vitals', () => {
  const answers = { ...usual, symptoms: ['headache', 'dizziness'], severity: 'severe', course: 'worsening', impact: 'unable', hydration: 'unable' };
  const before = JSON.stringify(answers);
  const result = wellnessAttention(answers);
  assert.ok(result.checks.some((check) => /promptly.*severe/.test(check)));
  assert.ok(result.checks.some((check) => /cannot keep fluids down/.test(check)));
  assert.ok(result.checks.some((check) => /location and pattern/.test(check)));
  assert.ok(result.checks.some((check) => /supervised assessment/.test(check)));
  assert.equal(JSON.stringify(answers), before);
  assert.equal(result.status, undefined);
});

test('routine answers retain monitoring without claiming health clearance', () => {
  assert.deepEqual(wellnessAttention(usual).checks, ['Continue your scheduled monitoring. Report any new symptoms or changes in how you feel.']);
});

test('sleep and emotional wellbeing answers select relevant follow-ups', () => {
  const result = wellnessAttention({ ...usual, sleepQuality: 'disrupted', stress: 'overwhelmed' });
  assert.equal(result.checks.length, 2);
  assert.match(result.checks[0], /sleep summary/);
  assert.match(result.checks[1], /wellbeing check/);
});
