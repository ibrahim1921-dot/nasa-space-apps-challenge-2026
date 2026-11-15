import test from 'node:test';
import assert from 'node:assert/strict';
import { captureObservationContext, contextForRecord, validateObservationContext } from './observationContext.js';
import { makeVitalsRecord } from './vitalsCheckinStore.js';
import { applyVitals } from './vitalsDashboard.js';

test('context snapshots stay attached to the correct measurement and do not mutate history', () => {
  const input = { activityContext: 'EXERCISING', workload: 'normal', notes: 'After scheduled exercise' };
  const context = captureObservationContext(input, 'heart_rate', '2026-11-15T08:00:00Z');
  const contexts = { heart_rate: context, blood_pressure: captureObservationContext({ activityContext: 'RESTING', bodyPosition: 'SEATED' }, 'blood_pressure') };
  const record = makeVitalsRecord({ crewId: 'test-person', reading: { heart_rate: 115 }, observationContexts: contexts, result: { status: 'watch', reasons: [] } });
  contexts.heart_rate.notes = 'Changed later';
  assert.equal(contextForRecord(record, 'heart_rate').notes, 'After scheduled exercise');
  assert.equal(contextForRecord(record, 'blood_pressure').bodyPosition, 'SEATED');
  assert.equal(contextForRecord(record, 'temperature').activityContext, 'UNKNOWN');
});

test('legacy questionnaire workload never becomes confirmed measurement activity', () => {
  const record = { payload: { reading: {}, context: { workload: 'high' } } };
  assert.equal(contextForRecord(record, 'heart_rate').activityContext, 'UNKNOWN');
  assert.equal(contextForRecord(record, 'heart_rate').sourceKind, 'SELF_REPORT');
  assert.equal(contextForRecord({ payload: { origin: 'seed', reading: {} } }, 'heart_rate').sourceKind, 'SIMULATION');
});

test('sleep has measurement-derived context; invalid input and irrelevant positions are rejected', () => {
  assert.equal(captureObservationContext({}, 'sleep_hours').activityContext, 'SLEEPING');
  assert.equal(captureObservationContext({}, 'sleep_hours').contextOrigin, 'MEASUREMENT_TYPE');
  assert.ok(validateObservationContext({ activityContext: 'RECOVERY' }, 'heart_rate'));
  assert.ok(validateObservationContext({ bodyPosition: 'STANDING' }, 'mood'));
  assert.ok(validateObservationContext({ notes: 'x'.repeat(501) }, 'heart_rate'));
  assert.equal(captureObservationContext({ activityContext: 'RESTING', workload: 'heavy' }, 'heart_rate').workload, null);
});

test('context presentation never suppresses an existing safety alert', () => {
  const record = { recorded_at: '2026-11-15T08:00:00Z', payload: {
    reading: { heart_rate: 115 }, observationContexts: { heart_rate: captureObservationContext({ activityContext: 'EXERCISING' }, 'heart_rate') },
    result: { indicators: { heart_rate: { id: 'heart_rate', value: 115, status: 'alert', reasons: ['Existing rule'], action: {} } } },
  } };
  const card = applyVitals({ id: 'heart-rate' }, record);
  assert.equal(card.status, 'alert');
  assert.equal(card.observationContext.activityContext, 'EXERCISING');
});
