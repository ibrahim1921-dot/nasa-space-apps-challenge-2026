import test from 'node:test';
import assert from 'node:assert/strict';
import { MOCK_CREW, matchesMockPin } from './mockCrewLogin.js';
import { DEMO_ACCOUNTS } from './demoAccounts.js';
import { canOpen } from './appScreens.js';

test('each card unlocks its own existing identity and rejects other PINs', () => {
  for (const person of MOCK_CREW) {
    assert.ok(DEMO_ACCOUNTS[person.who]);
    assert.equal(matchesMockPin(person.who, person.pin), true);
    assert.equal(matchesMockPin(person.who, '0000'), false);
    assert.equal(matchesMockPin(person.who, ''), false);
    for (const other of MOCK_CREW.filter((entry) => entry.who !== person.who)) {
      assert.equal(matchesMockPin(person.who, other.pin), false);
    }
  }
  assert.equal(matchesMockPin('unknown', '1234'), false);
});

test('medical access is predetermined by identity', () => {
  assert.equal(DEMO_ACCOUNTS.lena.role, 'cmo');
  assert.equal(canOpen(DEMO_ACCOUNTS.lena, 'mydata'), true);
  for (const who of ['maya', 'tomas', 'kwame']) {
    assert.equal(DEMO_ACCOUNTS[who].role, 'crew');
    assert.equal(canOpen(DEMO_ACCOUNTS[who], 'mydata'), false);
  }
});
