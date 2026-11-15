// App roles for the crew in data/crew.json. crew.json's `role` is a job title ("Commander"); the app
// only knows two access roles: 'cmo' (sees the whole crew) and 'crew' (sees their own data).
// Shared by the demo accounts (lib/demoAccounts.js) and the database seed (lib/seedRows.js).

/** The Crew Medical Officer: Lena Kowalski. Everyone else is 'crew'. */
export const CMO_CREW_ID = 'crew-03';

/** @returns {'cmo' | 'crew'} */
export const appRoleFor = (crewId) => (crewId === CMO_CREW_ID ? 'cmo' : 'crew');
