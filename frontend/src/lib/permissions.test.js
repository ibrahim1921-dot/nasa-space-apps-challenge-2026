// Only the Crew Medical Officer may view other people's data. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREW_IDS, OVERVIEW, canView, canViewOthers, resolveViewedId } from './permissions.js';
import { DEMO_ACCOUNTS } from './demoAccounts.js';

const { maya, tomas, lena, kwame } = DEMO_ACCOUNTS;

test('canViewOthers is true for the CMO only', () => {
  assert.equal(canViewOthers('cmo'), true);
  assert.equal(canViewOthers('crew'), false);
  assert.equal(canViewOthers(undefined), false);
  assert.equal(canViewOthers(null), false);
  assert.equal(canViewOthers('CMO'), false);
  for (const a of [maya, tomas, kwame]) assert.equal(canViewOthers(a.role), false, a.who);
  assert.equal(canViewOthers(lena.role), true);
});

test('canView: everyone may view themselves; crew may view no one else', () => {
  for (const a of [maya, tomas, kwame]) {
    assert.equal(canView(a.crewId, a.role, a.crewId), true, `${a.who} → self`);
    for (const other of CREW_IDS.filter((id) => id !== a.crewId)) {
      assert.equal(canView(a.crewId, a.role, other), false, `${a.who} → ${other}`);
    }
  }
});

test('canView: the CMO may view any known crew member, never an unknown id', () => {
  for (const id of CREW_IDS) assert.equal(canView(lena.crewId, 'cmo', id), true, id);
  assert.equal(canView(lena.crewId, 'cmo', 'crew-99'), false);
  assert.equal(canView(lena.crewId, 'cmo', OVERVIEW), false);
  assert.equal(canView(lena.crewId, 'cmo', null), false);
  assert.equal(canView(null, 'cmo', tomas.crewId), false);
});

test('a stale viewedId pointing at someone else resets to the crew member’s own id', () => {
  // e.g. left over in state or storage from an earlier CMO session in the same browser
  for (const a of [maya, tomas, kwame]) {
    for (const stale of [lena.crewId, ...CREW_IDS.filter((id) => id !== a.crewId), OVERVIEW, 'crew-99', null, undefined]) {
      assert.equal(resolveViewedId({ viewerId: a.crewId, viewerRole: a.role, requested: stale }), a.crewId, `${a.who} ← ${stale}`);
    }
    assert.equal(resolveViewedId({ viewerId: a.crewId, viewerRole: a.role, requested: a.crewId }), a.crewId);
  }
});

test('the CMO keeps a valid viewedId, opens on the crew page, and an unknown id falls back to it', () => {
  const r = (requested) => resolveViewedId({ viewerId: lena.crewId, viewerRole: 'cmo', requested });
  assert.equal(r(OVERVIEW), OVERVIEW);
  assert.equal(r(tomas.crewId), tomas.crewId);
  assert.equal(r(lena.crewId), lena.crewId);
  assert.equal(r('crew-99'), OVERVIEW);
  assert.equal(r(null), OVERVIEW);
  assert.equal(r(undefined), OVERVIEW);
});
