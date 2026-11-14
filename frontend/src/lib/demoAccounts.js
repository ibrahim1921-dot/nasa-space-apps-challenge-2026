// The two demo identities behind "Enter as Maya (crew)" and "Enter as Lena (CMO)".
// No passwords: judges get in with one click. crewId must match the crew ids the backend uses.

export const DEMO_ACCOUNTS = {
  maya: { who: 'maya', crewId: 'crew-01', role: 'crew', button: 'Enter as Maya (crew)' },
  lena: { who: 'lena', crewId: 'crew-03', role: 'cmo', button: 'Enter as Lena (CMO)' },
};

export const DEFAULT_DEMO = 'maya';

export const isDemoWho = (v) => typeof v === 'string' && Object.hasOwn(DEMO_ACCOUNTS, v);

export const demoFor = (who) => DEMO_ACCOUNTS[isDemoWho(who) ? who : DEFAULT_DEMO];
