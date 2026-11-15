// Only the Crew Medical Officer may open the exam form. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canOpen } from './appScreens.js';
import { DEMO_ACCOUNTS } from './demoAccounts.js';

test('the exam view opens for the CMO only; crew have no way to record for anyone else', () => {
  assert.equal(canOpen(DEMO_ACCOUNTS.lena, 'exam'), true);
  for (const who of ['maya', 'tomas', 'kwame']) assert.equal(canOpen(DEMO_ACCOUNTS[who], 'exam'), false, who);
  assert.equal(canOpen(null, 'exam'), false);
});
