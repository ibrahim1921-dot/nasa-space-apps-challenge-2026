// Signed-out state, sign-in, sign-out and who sees which tabs. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDENTITY_KEY, clearIdentity, readIdentity, writeIdentity } from './identity.js';
import { canOpen, screenFor, tabsFor } from './appScreens.js';
import { DEMO_ACCOUNTS } from './demoAccounts.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('nothing stored means signed out; junk is ignored', () => {
  assert.equal(readIdentity(memoryStorage()), null);
  assert.equal(readIdentity(memoryStorage({ [IDENTITY_KEY]: '"someone"' })), null);
  assert.equal(readIdentity(memoryStorage({ [IDENTITY_KEY]: '{bad json' })), null);
  assert.equal(readIdentity(null), null);
});

test('sign in, then sign out, keeps other saved data', () => {
  const storage = memoryStorage({ 'ahm.vitals.v1': '[1]' });
  writeIdentity(storage, 'maya');
  assert.equal(readIdentity(storage), 'maya');
  clearIdentity(storage);
  assert.equal(readIdentity(storage), null);
  assert.equal(storage.getItem('ahm.vitals.v1'), '[1]');
  assert.throws(() => writeIdentity(storage, 'nobody'));
});

test('landing until the identity is read, then landing or app', () => {
  assert.equal(screenFor({ ready: false, who: 'maya' }), 'loading');
  assert.equal(screenFor({ ready: true, who: null }), 'landing');
  assert.equal(screenFor({ ready: true, who: 'lena' }), 'app');
});

test('personal pages remain grouped under the medical officer My Data navigation', () => {
  const maya = tabsFor(DEMO_ACCOUNTS.maya).map((t) => t.id);
  const lena = tabsFor(DEMO_ACCOUNTS.lena).map((t) => t.id);
  assert.equal(maya.includes('cmo'), false);
  assert.ok(maya.includes('environment'));
  assert.equal(canOpen(DEMO_ACCOUNTS.maya, 'cmo'), false);
  assert.deepEqual(lena, ['dashboard', 'mydata', 'environment', 'about']);
  assert.equal(canOpen(DEMO_ACCOUNTS.lena, 'mydata'), true);
  assert.equal(canOpen(DEMO_ACCOUNTS.maya, 'mydata'), false);
  assert.equal(canOpen(DEMO_ACCOUNTS.lena, 'checkin'), true);
  for (const id of ['sleep', 'labs', 'standtest']) {
    assert.equal(canOpen(DEMO_ACCOUNTS.lena, id), false);
    assert.equal(canOpen(DEMO_ACCOUNTS.maya, id), false);
  }
  for (const id of ['dashboard', 'checkin', 'environment']) {
    assert.equal(canOpen(DEMO_ACCOUNTS.maya, id), true);
  }
});
