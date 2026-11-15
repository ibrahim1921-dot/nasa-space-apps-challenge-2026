// One demo account per crew member, built from crew.json; Lena (crew-03) is the only CMO.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEMO_ACCOUNTS, DEMO_ACCOUNT_LIST, isDemoWho, roleNoteFor, whoFor } from './demoAccounts.js';
import { canOpen, tabsFor } from './appScreens.js';
import { seedCrewMembers } from './seedRows.js';

const crewFile = JSON.parse(readFileSync(new URL('../data/crew.json', import.meta.url), 'utf8'));

test('every crew member in crew.json has a demo account, in crew.json order', () => {
  assert.equal(DEMO_ACCOUNT_LIST.length, crewFile.crew.length);
  assert.deepEqual(DEMO_ACCOUNT_LIST.map((a) => a.crewId), crewFile.crew.map((c) => c.id));
  for (const c of crewFile.crew) {
    const a = DEMO_ACCOUNT_LIST.find((x) => x.crewId === c.id);
    assert.equal(a.name, c.name);
    assert.equal(a.title, c.role);
  }
});

test('account keys stay stable: maya, tomas, lena, kwame', () => {
  assert.deepEqual(Object.keys(DEMO_ACCOUNTS), ['maya', 'tomas', 'lena', 'kwame']);
  for (const [key, a] of Object.entries(DEMO_ACCOUNTS)) {
    assert.equal(a.who, key);
    assert.equal(isDemoWho(key), true);
  }
  assert.equal(whoFor('Zoë Ngata'), 'zoe', 'accents are dropped from the key');
  assert.equal(isDemoWho('nobody'), false);
  assert.equal(isDemoWho('constructor'), false);
});

test('demo accounts carry no e-mail or password', () => {
  for (const a of DEMO_ACCOUNT_LIST) {
    assert.equal('email' in a, false);
    assert.equal('password' in a, false);
  }
});

test('exactly one account is the CMO: Lena (crew-03), matching the database seed', () => {
  const cmos = DEMO_ACCOUNT_LIST.filter((a) => a.role === 'cmo');
  assert.equal(cmos.length, 1);
  assert.equal(cmos[0].who, 'lena');
  assert.equal(cmos[0].crewId, 'crew-03');
  for (const a of DEMO_ACCOUNT_LIST) if (a.who !== 'lena') assert.equal(a.role, 'crew');
  const seeded = Object.fromEntries(seedCrewMembers(crewFile).map((r) => [r.id, r.role]));
  for (const a of DEMO_ACCOUNT_LIST) assert.equal(a.role, seeded[a.crewId], `${a.who}: app role = crew_members.role`);
});

test('tabsFor gives the Crew tab to Lena only', () => {
  for (const a of DEMO_ACCOUNT_LIST) {
    const ids = tabsFor(a).map((t) => t.id);
    assert.equal(ids.includes('cmo'), a.who === 'lena', a.who);
  }
});

test('canOpen blocks the CMO view for Maya, Tomas and Kwame; everyone opens their own views', () => {
  for (const who of ['maya', 'tomas', 'kwame']) assert.equal(canOpen(DEMO_ACCOUNTS[who], 'cmo'), false, who);
  assert.equal(canOpen(DEMO_ACCOUNTS.lena, 'cmo'), true);
  for (const a of DEMO_ACCOUNT_LIST) {
    for (const id of ['dashboard', 'checkin', 'standtest']) assert.equal(canOpen(a, id), true, `${a.who} ${id}`);
  }
});

test('landing notes are built from the role', () => {
  assert.equal(roleNoteFor(DEMO_ACCOUNTS.tomas), 'Commander · own dashboard, check-ins and stand tests');
  assert.equal(roleNoteFor(DEMO_ACCOUNTS.lena), 'Crew medical officer · own dashboard plus the whole-crew view');
});
