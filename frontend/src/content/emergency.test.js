import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMERGENCY_SOURCES } from './limits.js';
import { AFTER_BREATHING_STEP, CHEST_PAIN_STEPS, COLLAPSE_STEPS, COLLAPSE_TOTAL, CPR_STEPS, cprStepIndex, notesFor } from './emergency.js';

const step = (id) => CPR_STEPS.find((s) => s.id === id);

test('Flow 2 CPR steps are in order, with the CMO and watch steps added; 10 steps in all', () => {
  assert.deepEqual(
    CPR_STEPS.map((s) => s.id),
    ['push', 'breaths', 'aed', 'surgeon', 'swap', 'continue', 'watch'],
  );
  assert.equal(COLLAPSE_STEPS.length, 3);
  assert.equal(COLLAPSE_TOTAL, 10);
});

test('the watch step is last, team-set, and is where "Breathing normally" jumps to', () => {
  const w = step('watch');
  assert.equal(w.source, 'team');
  assert.equal(w.text, 'Stay with them and keep them held in place. Keep checking their breathing. If it stops, start compressions again.');
  assert.equal(AFTER_BREATHING_STEP, 'watch');
  assert.equal(cprStepIndex(AFTER_BREATHING_STEP), CPR_STEPS.length - 1);
  assert.equal(cprStepIndex('nope'), -1);
});

test('the CMO step after the AED uses the same delay action and wording as Flow 1', () => {
  const s = step('surgeon');
  assert.equal(cprStepIndex('surgeon'), cprStepIndex('aed') + 1);
  assert.equal(s.source, 'team');
  assert.equal(s.who, 'cmo');
  assert.equal(s.action, 'delay');
  const flow1 = CHEST_PAIN_STEPS.find((x) => x.id === 'surgeon');
  assert.equal(s.text, flow1.text);
  assert.equal(s.action, flow1.action);
});

test('the airway note shows on the station and spacecraft, not on the Moon', () => {
  const b = step('breaths');
  assert.equal(b.source, 'aha_erc');
  for (const env of ['station', 'spacecraft']) {
    const notes = notesFor(b, env);
    assert.equal(notes.length, 1, env);
    assert.equal(notes[0].source, 'cpr_micro_2020');
    assert.equal(
      notes[0].text,
      'In weightlessness, give breaths or use an airway device only when the person is restrained and two rescuers are present. Until then, keep doing compressions.',
    );
  }
  assert.deepEqual(notesFor(b, 'moon'), []);
});

test('the AED shock line shows in every environment and is team-set', () => {
  for (const env of ['station', 'spacecraft', 'moon']) {
    const notes = notesFor(step('aed'), env);
    assert.equal(notes.length, 1, env);
    assert.equal(notes[0].source, 'team');
    assert.equal(notes[0].text, 'During a shock nobody touches the person, or anything metal they are touching.');
  }
});

test('every note names a known source; steps without notes give none', () => {
  for (const s of CPR_STEPS) for (const n of s.notes ?? []) assert.ok(EMERGENCY_SOURCES[n.source], `${s.id}/${n.id} has source ${n.source}`);
  assert.deepEqual(notesFor(step('push'), 'station'), []);
});
