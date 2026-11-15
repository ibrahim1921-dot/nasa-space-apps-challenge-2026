import test from 'node:test';
import assert from 'node:assert/strict';
import { MOCK_CREW } from './mockCrewLogin.js';
import { DEMO_ACCOUNTS } from './demoAccounts.js';
import { canOpen } from './appScreens.js';

test('each demo card opens its own existing identity and carries no PIN or password', () => {
  assert.equal(MOCK_CREW.length, Object.keys(DEMO_ACCOUNTS).length);
  for (const person of MOCK_CREW) {
    assert.ok(DEMO_ACCOUNTS[person.who]);
    assert.equal(person.name, DEMO_ACCOUNTS[person.who].name);
    assert.equal('pin' in person, false);
    assert.equal('password' in person, false);
  }
});

test('medical access is predetermined by identity', () => {
  assert.equal(DEMO_ACCOUNTS.lena.role, 'cmo');
  assert.equal(canOpen(DEMO_ACCOUNTS.lena, 'cmo'), true);
  for (const who of ['maya', 'tomas', 'kwame']) {
    assert.equal(DEMO_ACCOUNTS[who].role, 'crew');
    assert.equal(canOpen(DEMO_ACCOUNTS[who], 'cmo'), false);
  }
});
