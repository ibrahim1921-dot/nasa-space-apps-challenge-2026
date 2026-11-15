// The demo identities behind the landing page doors: one per crew member in data/crew.json, in
// crew.json order. Ids, names and job titles come from crew.json; the access role ('crew' | 'cmo')
// from constants/crewRoles.js, so Lena Kowalski (crew-03) is the only CMO.
// No secrets and no passwords: these are local demo identities for "Explore with demo data" only.
// Real accounts are provisioned on the backend (docs/demo-account-provisioning.md).

import crewData from '../data/crew.json' with { type: 'json' };
import { appRoleFor } from '../constants/crewRoles.js';

/** 'Maya Okafor' -> 'maya'. Stable keys: they are stored in the browser. */
export const whoFor = (name) =>
  name
    .split(' ')[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const accounts = crewData.crew.map(({ id, name, role: title }) => {
  const who = whoFor(name);
  const firstName = name.split(' ')[0];
  return {
    who,
    crewId: id,
    role: appRoleFor(id),
    name,
    firstName,
    title,
    button: `Enter as ${firstName}`,
  };
});

/** { maya: {...}, tomas: {...}, lena: {...}, kwame: {...} }, in crew.json order. */
export const DEMO_ACCOUNTS = Object.freeze(Object.fromEntries(accounts.map((a) => [a.who, Object.freeze(a)])));

/** Every demo account, in crew.json order. */
export const DEMO_ACCOUNT_LIST = Object.freeze(Object.values(DEMO_ACCOUNTS));

if (DEMO_ACCOUNT_LIST.length !== crewData.crew.length) {
  throw new Error('Two crew members in data/crew.json share a first name; demo account keys must be unique.');
}

export const isDemoWho = (v) => typeof v === 'string' && Object.hasOwn(DEMO_ACCOUNTS, v);

/** The landing door note, built from the person's role. */
export const roleNoteFor = (account) =>
  account.role === 'cmo'
    ? 'Crew medical officer · own dashboard plus the whole-crew view'
    : `${account.title} · own dashboard, check-ins and stand tests`;
