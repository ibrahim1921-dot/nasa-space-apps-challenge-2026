// Who is signed in, and how they sign out. Pure, with everything injected (storage, API client), so
// node:test can check each step.
//
// Two modes:
//   'live'  a real backend session (docs/authentication-phase2.md). The role and profile come only from
//           POST /api/auth/login and GET /api/auth/me; nothing in the browser can choose them.
//   'demo'  "Explore with demo data": the local demo crew, bundled synthetic data, no backend. Clearly
//           labelled in the UI. Only the chosen demo person is stored; there is no password.
// Readings saved on this device are never touched by sign-out.

import { DEMO_ACCOUNTS, DEMO_ACCOUNT_LIST, isDemoWho } from './demoAccounts.js';
import { appRoleFor } from '../constants/crewRoles.js';
import { clearIdentity } from './identity.js';

export const OFFICER_LABEL = 'Ground medical officer';

/**
 * Backend AccountIdentity → the app's account.
 * ASTRONAUT → 'crew' (or 'cmo' for crew-03, the onboard CMO, whose whole-crew view uses local data only).
 * NASA_OFFICER → 'officer', no crewId (officers have no astronaut profile).
 */
export function accountFromIdentity(identity) {
  if (!identity || typeof identity !== 'object') return null;
  if (identity.role === 'NASA_OFFICER') {
    return {
      mode: 'live',
      backendRole: 'NASA_OFFICER',
      role: 'officer',
      who: null,
      crewId: null,
      astronautId: null,
      loginName: identity.loginName ?? null,
      name: OFFICER_LABEL,
      firstName: OFFICER_LABEL,
      title: 'NASA officer (ground)',
    };
  }
  if (identity.role === 'ASTRONAUT' && identity.profile?.crewCode) {
    const { crewCode, astronautId, displayName } = identity.profile;
    const local = DEMO_ACCOUNT_LIST.find((a) => a.crewId === crewCode);
    const name = displayName || local?.name || crewCode;
    return {
      mode: 'live',
      backendRole: 'ASTRONAUT',
      role: appRoleFor(crewCode),
      who: local?.who ?? null,
      crewId: crewCode,
      astronautId: astronautId ?? null,
      loginName: identity.loginName ?? null,
      name,
      firstName: name.split(' ')[0],
      title: local?.title ?? null,
    };
  }
  return null; // unknown role or astronaut without a profile: treat as signed out
}

/** A local demo person → the app's account. */
export function demoAccountFor(who) {
  if (!isDemoWho(who)) return null;
  const a = DEMO_ACCOUNTS[who];
  return { ...a, mode: 'demo', backendRole: null, astronautId: null, loginName: null };
}

/** A key that changes whenever the person changes, so App remounts and no state carries over. */
export const accountKey = (account) => (account ? `${account.mode}:${account.role}:${account.crewId ?? account.loginName ?? ''}` : '');

/**
 * Sign out. Live: POST /api/auth/logout (the backend invalidates the session and cookie); a failed call
 * still signs out here. Demo: forget the stored demo person. Either way readings on the device stay.
 */
export async function signOutFlow({ account, api, storage }) {
  let error = null;
  if (account?.mode === 'live' && api) {
    try {
      await api.logout();
    } catch (err) {
      error = err;
    }
  }
  clearIdentity(storage);
  return { error };
}
