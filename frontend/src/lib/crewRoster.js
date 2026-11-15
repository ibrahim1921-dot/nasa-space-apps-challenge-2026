import { DEMO_ACCOUNTS } from './demoAccounts.js';
import { MOCK_CREW } from './mockCrewLogin.js';

// Existing sign-in identities only; no health records or invented mission metadata.
export const crewRoster = MOCK_CREW.map((person) => ({
  id: DEMO_ACCOUNTS[person.who].crewId,
  name: person.name,
  role: DEMO_ACCOUNTS[person.who].role,
  title: DEMO_ACCOUNTS[person.who].role === 'cmo' ? 'Crew Medical Officer' : 'Crew member',
}));
