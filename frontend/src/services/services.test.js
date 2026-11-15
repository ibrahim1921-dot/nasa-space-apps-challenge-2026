// Crew adapter, alert query building and lifecycle rules, baselines/rules helpers, ML assessment
// service. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCrewView, toCrewViews, nameIndex } from '../lib/crewAdapter.js';
import { listCrew, myProfile } from './crewService.js';
import {
  INDICATOR_CODES,
  acknowledgeAlert,
  alertActions,
  buildAlertQuery,
  dayToInstant,
  indicatorLabel,
  isSyntheticAlert,
  listCrewAlerts,
  listMyAlerts,
  resolveAlert,
} from './alertService.js';
import { activationEvents, baselineApproved, ruleActiveNow } from './baselineService.js';
import { ASSESSMENT_IS_DEMO, getAssessment, normalizeAssessment } from './assessmentService.js';

/** Fake api client recording calls. */
function fakeApi(responses = {}) {
  const calls = [];
  return {
    calls,
    get: async (path, opts) => {
      calls.push(['GET', path, opts?.query]);
      return responses[path];
    },
    post: async (path, body) => {
      calls.push(['POST', path, body]);
      return responses[path];
    },
  };
}

test('crew adapter: crewCode becomes the frontend crewId, astronautId kept, titles from local data', () => {
  const v = toCrewView({ astronautId: 'u-1', crewCode: 'crew-01', displayName: 'Maya Okafor' });
  assert.deepEqual(v, { crewId: 'crew-01', astronautId: 'u-1', name: 'Maya Okafor', title: 'Flight engineer', titleSource: 'local', hasLocalData: true, archivedAt: null });
  const unknown = toCrewView({ astronautId: 'u-9', crewCode: 'crew-99', displayName: 'New Person' });
  assert.equal(unknown.hasLocalData, false);
  assert.equal(unknown.title, null);
  assert.equal(toCrewView({ astronautId: 'x' }), null);
  assert.deepEqual(toCrewViews(null), []);
  assert.equal(nameIndex(toCrewViews([{ astronautId: 'u-2', crewCode: 'crew-02', displayName: 'Tomas Reyes' }])).get('u-2'), 'Tomas Reyes');
});

test('crew service calls the documented routes', async () => {
  const api = fakeApi({ '/api/crew': [{ astronautId: 'u-1', crewCode: 'crew-01', displayName: 'Maya Okafor' }], '/api/crew/me': { astronautId: 'u-1', crewCode: 'crew-01', displayName: 'Maya Okafor', createdAt: 'x', archivedAt: null } });
  assert.equal((await listCrew(api))[0].crewId, 'crew-01');
  assert.equal((await myProfile(api)).astronautId, 'u-1');
  assert.deepEqual(api.calls.map((c) => c[1]), ['/api/crew', '/api/crew/me']);
});

test('alert query: only valid filters are sent; astronautId only for officers', () => {
  const filter = { page: 2, status: 'OPEN', severity: 'bogus', indicator: 'heart_rate', astronautId: 'u-1', synthetic: 'true', fromDay: '2026-11-01', toDay: '2026-11-14' };
  assert.deepEqual(buildAlertQuery(filter), { page: 2, size: 20, status: 'OPEN', indicator: 'heart_rate', synthetic: 'true', from: '2026-11-01T00:00:00.000Z', to: '2026-11-15T00:00:00.000Z' });
  assert.equal(buildAlertQuery(filter, { officer: true }).astronautId, 'u-1');
  assert.equal(buildAlertQuery({ page: -3 }).page, 0);
  assert.equal(buildAlertQuery({ fromDay: '2026-11-10', toDay: '2026-11-01' }).to, undefined, 'from must be before to');
  assert.equal(dayToInstant('nope'), null);
});

test('alert service routes: /me for astronauts, /api/alerts for officers, POST bodies as documented', async () => {
  const api = fakeApi();
  await listMyAlerts({ astronautId: 'u-1' }, api);
  await listCrewAlerts({ astronautId: 'u-1' }, api);
  await acknowledgeAlert('al-1', api);
  await resolveAlert('al-1', 'Reviewed and followed up.', api);
  assert.deepEqual(api.calls[0], ['GET', '/api/alerts/me', { page: 0, size: 20 }]);
  assert.equal(api.calls[1][2].astronautId, 'u-1');
  assert.deepEqual(api.calls[2], ['POST', '/api/alerts/al-1/acknowledge', undefined]);
  assert.deepEqual(api.calls[3], ['POST', '/api/alerts/al-1/resolve', { note: 'Reviewed and followed up.' }]);
  await assert.rejects(resolveAlert('al-1', '  ', api), /required/);
  await assert.rejects(resolveAlert('al-1', 'x'.repeat(2001), api), /2000/);
  assert.equal(api.calls.length, 4, 'invalid notes never reach the backend');
});

test('alert actions follow the lifecycle table', () => {
  assert.deepEqual(alertActions({ status: 'OPEN' }, 'ASTRONAUT'), { canAcknowledge: true, canResolve: false, needsAcknowledgeFirst: false });
  assert.deepEqual(alertActions({ status: 'OPEN' }, 'NASA_OFFICER'), { canAcknowledge: true, canResolve: false, needsAcknowledgeFirst: true });
  assert.deepEqual(alertActions({ status: 'ACKNOWLEDGED' }, 'NASA_OFFICER'), { canAcknowledge: false, canResolve: true, needsAcknowledgeFirst: false });
  assert.deepEqual(alertActions({ status: 'ACKNOWLEDGED' }, 'ASTRONAUT'), { canAcknowledge: false, canResolve: false, needsAcknowledgeFirst: false });
  assert.deepEqual(alertActions({ status: 'RESOLVED' }, 'NASA_OFFICER'), { canAcknowledge: false, canResolve: false, needsAcknowledgeFirst: false });
  assert.equal(isSyntheticAlert({ synthetic: false, nonclinical: true }), true);
  assert.equal(isSyntheticAlert({ synthetic: false, nonclinical: false }), false);
});

test('indicator codes are the nine from migration V22', () => {
  assert.equal(INDICATOR_CODES.length, 9);
  assert.equal(indicatorLabel('blood_sugar'), 'Blood glucose');
  assert.equal(indicatorLabel('new_code'), 'New code');
});

test('rules: active only after an effective activation event; baselines need an approval', () => {
  const now = Date.parse('2026-11-15T00:00:00Z');
  const rule = { activation_history: JSON.stringify([{ active: true, effective_at: '2026-11-01T00:00:00Z' }, { active: false, effective_at: '2026-12-01T00:00:00Z' }]) };
  assert.equal(ruleActiveNow(rule, now), true);
  assert.equal(ruleActiveNow({ activation_history: '[]' }, now), false);
  assert.deepEqual(activationEvents({ activation_history: 'not json' }), []);
  assert.equal(baselineApproved({ approved_at: '2026-11-01T00:00:00Z' }), true);
  assert.equal(baselineApproved({ approved_at: null }), false);
});

test('assessment service: demo data in each state, never without the demo flag', async () => {
  assert.equal(ASSESSMENT_IS_DEMO, true);
  const ok = await getAssessment('u-1', 'crew-01');
  assert.equal(ok.state, 'ok');
  assert.equal(ok.demo, true);
  assert.equal(ok.model.version, '0.0.0-demo');
  assert.equal((await getAssessment('u-2', 'crew-02')).anomaly.status, 'ANOMALY');
  const thin = await getAssessment('u-3', 'crew-03');
  assert.equal(thin.state, 'insufficient');
  assert.deepEqual(thin.missing, ['sleep_hours', 'blood_pressure']);
  assert.equal((await getAssessment('u-4', 'crew-04')).state, 'error');
  assert.equal((await getAssessment(null, 'crew-77')).state, 'insufficient');
});

test('normalizeAssessment drops bad values and keeps the expected shape', () => {
  const n = normalizeAssessment({ assessedAt: 'x', model: { name: 'm', version: '1' }, risk: { class: 'LOW', probability: 'high', explanation: ['a', 3] }, anomaly: null, inputs: { missing: [] } }, { demo: false });
  assert.equal(n.state, 'ok');
  assert.equal(n.risk.probability, null);
  assert.deepEqual(n.risk.explanation, ['a']);
  assert.equal(normalizeAssessment(null, { demo: false }).state, 'error');
});

test('demo assessment text never uses diagnostic wording', async () => {
  const { MOCK_ASSESSMENTS } = await import('../mocks/mlAssessment.js');
  const text = JSON.stringify(MOCK_ASSESSMENTS).toLowerCase();
  for (const word of ['diagnos', 'disease', 'disorder', 'patient has', 'you have']) assert.ok(!text.includes(word), word);
});
