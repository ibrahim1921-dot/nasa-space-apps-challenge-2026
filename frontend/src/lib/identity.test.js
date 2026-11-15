// Signed-out state, live and demo accounts, sign-out, and who sees which tabs. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDENTITY_KEY, readIdentity, writeIdentity } from './identity.js';
import { OFFICER_LABEL, accountFromIdentity, accountKey, demoAccountFor, signOutFlow } from './session.js';
import { canOpen, homeFor, screenFor, tabsFor } from './appScreens.js';
import { DEMO_ACCOUNTS } from './demoAccounts.js';

/** localStorage stand-in. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const READINGS = { 'ahm.dailyVitals.v1': '[{"id":"r1","synced_at":null}]', 'ahm.standTests.v1': '[{"id":"s1"}]' };
const MAYA = { accountId: 'a-1', loginName: 'maya.demo', role: 'ASTRONAUT', profile: { astronautId: 'u-1', crewCode: 'crew-01', displayName: 'Maya Okafor' } };
const LENA = { accountId: 'a-3', loginName: 'lena.demo', role: 'ASTRONAUT', profile: { astronautId: 'u-3', crewCode: 'crew-03', displayName: 'Lena Kowalski' } };
const OFFICER = { accountId: 'a-5', loginName: 'officer.demo', role: 'NASA_OFFICER', profile: null };

test('first load with nothing stored: no identity, so the landing screen shows', () => {
  const storage = memoryStorage();
  const who = readIdentity(storage);
  assert.equal(who, null);
  assert.equal(screenFor({ ready: true, who }), 'landing');
  assert.equal(screenFor({ ready: false, who }), 'loading', 'nothing flashes before the session is read');
  assert.deepEqual(tabsFor(null), []);
});

test('a stored demo identity opens the app; junk in storage is treated as signed out', () => {
  assert.equal(screenFor({ ready: true, who: readIdentity(memoryStorage({ [IDENTITY_KEY]: '"maya"' })) }), 'app');
  assert.equal(readIdentity(memoryStorage({ [IDENTITY_KEY]: '"tomas"' })), 'tomas');
  assert.equal(readIdentity(memoryStorage({ [IDENTITY_KEY]: '"nobody"' })), null);
  assert.equal(readIdentity(memoryStorage({ [IDENTITY_KEY]: 'not json' })), null);
  const blocked = { getItem: () => { throw new Error('SecurityError'); } };
  assert.equal(readIdentity(blocked), null);
  assert.throws(() => writeIdentity(memoryStorage(), 'nobody'));
});

test('live astronaut: role and profile come from the backend identity; crewCode is the local crewId', () => {
  const maya = accountFromIdentity(MAYA);
  assert.equal(maya.mode, 'live');
  assert.equal(maya.role, 'crew');
  assert.equal(maya.crewId, 'crew-01');
  assert.equal(maya.astronautId, 'u-1');
  assert.equal(maya.who, 'maya', 'linked to the local records of the same crew code');
  assert.equal(accountFromIdentity(LENA).role, 'cmo', 'crew-03 is the onboard CMO');
});

test('live officer: no astronaut profile, ground officer label, officer tabs only', () => {
  const officer = accountFromIdentity(OFFICER);
  assert.equal(officer.role, 'officer');
  assert.equal(officer.crewId, null);
  assert.equal(officer.name, OFFICER_LABEL);
  const ids = tabsFor(officer).map((t) => t.id);
  assert.deepEqual(ids, ['officerCrew', 'officerAlerts', 'baselines', 'rules', 'more']);
  assert.equal(canOpen(officer, 'checkin'), false, 'officers have no personal check-ins');
  assert.equal(canOpen(officer, 'dashboard'), false);
  assert.equal(canOpen(officer, 'knowledge'), true);
  assert.equal(homeFor(officer), 'officerCrew');
});

test('unknown roles, missing profiles and junk are not accounts', () => {
  assert.equal(accountFromIdentity(null), null);
  assert.equal(accountFromIdentity({ role: 'ADMIN' }), null);
  assert.equal(accountFromIdentity({ role: 'ASTRONAUT', profile: null }), null);
});

test('demo accounts are marked demo; keys differ between people and modes', () => {
  const demo = demoAccountFor('maya');
  assert.equal(demo.mode, 'demo');
  assert.equal(demoAccountFor('nobody'), null);
  assert.notEqual(accountKey(demo), accountKey(accountFromIdentity(MAYA)));
  assert.notEqual(accountKey(demoAccountFor('maya')), accountKey(demoAccountFor('tomas')));
  assert.equal(accountKey(null), '');
});

test('live sign-out calls POST /api/auth/logout, forgets the identity and keeps readings', async () => {
  const storage = memoryStorage({ [IDENTITY_KEY]: '"maya"', ...READINGS });
  const calls = [];
  const api = { logout: async () => calls.push('logout') };
  const { error } = await signOutFlow({ account: accountFromIdentity(MAYA), api, storage });
  assert.equal(error, null);
  assert.deepEqual(calls, ['logout']);
  assert.equal(readIdentity(storage), null);
  for (const [k, v] of Object.entries(READINGS)) assert.equal(storage.getItem(k), v, `${k} must stay on the device`);
});

test('live sign-out still signs out here when the backend cannot be reached', async () => {
  const storage = memoryStorage({ [IDENTITY_KEY]: '"lena"' });
  const api = { logout: async () => { throw new Error('Backend not reachable.'); } };
  const { error } = await signOutFlow({ account: accountFromIdentity(LENA), api, storage });
  assert.ok(error);
  assert.equal(readIdentity(storage), null);
});

test('demo sign-out never calls the backend', async () => {
  const storage = memoryStorage({ [IDENTITY_KEY]: '"maya"', ...READINGS });
  let called = false;
  await signOutFlow({ account: demoAccountFor('maya'), api: { logout: async () => (called = true) }, storage });
  assert.equal(called, false);
  assert.equal(readIdentity(storage), null);
  assert.equal(storage.getItem('ahm.dailyVitals.v1'), READINGS['ahm.dailyVitals.v1']);
});

test('Maya never sees the Crew (CMO) tab; Lena gets Crew first and her own data under My data', () => {
  const maya = demoAccountFor('maya');
  const lena = demoAccountFor('lena');
  const lenaTabs = tabsFor(lena);
  assert.equal(tabsFor(maya).some((t) => t.id === 'cmo'), false);
  assert.equal(canOpen(maya, 'cmo'), false);
  assert.deepEqual(lenaTabs.map((t) => t.id), ['cmo', 'mydata', 'environment', 'more']);
  assert.deepEqual(lenaTabs[1].items.map((i) => i.id), ['dashboard', 'vitals', 'sleep', 'labs', 'standtest']);
  assert.equal(homeFor(lena), 'cmo');
  assert.equal(homeFor(maya), 'dashboard');
  for (const id of ['dashboard', 'standtest', 'checkin', 'alerts', 'knowledge', 'assessment']) {
    assert.equal(canOpen(maya, id), true, `maya ${id}`);
    assert.equal(canOpen(lena, id), true, `lena ${id}`);
  }
  assert.equal(canOpen(DEMO_ACCOUNTS.maya, 'officerAlerts'), false);
});
