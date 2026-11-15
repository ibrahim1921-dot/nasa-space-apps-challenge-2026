// Mock crew identities. Card names and preview PINs live in mockCrewLogin.js.
// crewId matches each person's bundled health records.

export const DEMO_ACCOUNTS = {
  maya: { who: 'maya', crewId: 'crew-01', role: 'crew', button: 'Enter as Maya (crew)' },
  lena: { who: 'lena', crewId: 'crew-03', role: 'cmo', button: 'Enter as Lena (CMO)' },
  tomas: { who: 'tomas', crewId: 'crew-02', role: 'crew', button: 'Enter as Tomas (crew)' },
  kwame: { who: 'kwame', crewId: 'crew-04', role: 'crew', button: 'Enter as Kwame (crew)' },
};

export const DEFAULT_DEMO = 'maya';

export const isDemoWho = (v) => typeof v === 'string' && Object.hasOwn(DEMO_ACCOUNTS, v);

export const demoFor = (who) => DEMO_ACCOUNTS[isDemoWho(who) ? who : DEFAULT_DEMO];
