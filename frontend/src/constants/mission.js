// Mission environments (profiles): where the crew are, and what that changes in the app.
// Delays are APPROXIMATE demo values: Moon is about 1.3 s; Mars really ranges from about
// 3 to 22 min one-way depending on where the planets are, and 20 min is used here.
//
// Original fields (kept as they were; the ground console, emergency summary and saved settings use them):
//   id, label, gravityArrival, delaySeconds, delayText
// Environment fields:
//   title          what the crew see ("Moon base")
//   shortLabel     header chip text ("Moon base · 0.17 g")
//   setting        'station' | 'spacecraft' | 'surface'
//   gravityG       surface gravity in g (0 = weightless); gravitySource cites it (content/limits.js key) or null
//   signal         'realtime' | 'seconds' | 'minutes' (how the escalation line reads)
//   delaySource    shown as "Approximate; changes with distance"
//   helpText, helpSource           how far help / a return to Earth is (team-set); helpShort for the Today line
//   radiationText, radiationSource radiation exposure line (team-set)
// The saved id lives in localStorage 'ahm.missionProfile.v1' (unchanged key; the old ids still load).

export const DELAY_SOURCE_LABEL = 'Approximate; changes with distance';

const MARS_DELAY = {
  delaySeconds: 20 * 60,
  delayText: 'about 20 min one-way (approximate demo value; real range about 3–22 min)',
};
const MOON_DELAY = { delaySeconds: 1.3, delayText: 'about 1.3 s one-way (approximate)' };

export const MISSION_PROFILES = [
  {
    id: 'iss',
    label: 'ISS (low Earth orbit)',
    gravityArrival: false,
    delaySeconds: 0,
    delayText: 'about 0 s (near real time)',
    title: 'Space station (low Earth orbit)',
    shortLabel: 'Station · 0 g',
    setting: 'station',
    gravityG: 0,
    gravitySource: null,
    signal: 'realtime',
    helpText: 'Hours (return in a docked capsule)',
    helpShort: 'hours',
    helpSource: 'team',
    radiationText: 'Partly shielded by Earth’s magnetic field',
    radiationSource: 'team',
  },
  {
    id: 'lunar_transit',
    label: 'Spacecraft to the Moon',
    gravityArrival: false,
    ...MOON_DELAY,
    title: 'Spacecraft to the Moon',
    shortLabel: 'To the Moon · 0 g',
    setting: 'spacecraft',
    gravityG: 0,
    gravitySource: null,
    signal: 'seconds',
    helpText: 'Days',
    helpShort: 'days',
    helpSource: 'team',
    radiationText: 'Deep space',
    radiationSource: 'team',
  },
  {
    id: 'moon',
    label: 'Moon base',
    gravityArrival: true,
    ...MOON_DELAY,
    title: 'Moon base',
    shortLabel: 'Moon base · 0.17 g',
    setting: 'surface',
    gravityG: 0.17,
    gravitySource: 'nasa_planetary_facts',
    signal: 'seconds',
    helpText: 'Days',
    helpShort: 'days',
    helpSource: 'team',
    radiationText: 'Deep space, surface shelter',
    radiationSource: 'team',
  },
  {
    id: 'mars',
    label: 'Mars transit',
    gravityArrival: true,
    ...MARS_DELAY,
    title: 'Spacecraft to Mars',
    shortLabel: 'To Mars · 20 min delay',
    setting: 'spacecraft',
    gravityG: 0,
    gravitySource: null,
    signal: 'minutes',
    helpText: 'Months',
    helpShort: 'months',
    helpSource: 'team',
    radiationText: 'Deep space',
    radiationSource: 'team',
  },
  {
    id: 'mars_surface',
    label: 'Mars base',
    gravityArrival: true,
    ...MARS_DELAY,
    title: 'Mars base',
    shortLabel: 'Mars base · 0.38 g',
    setting: 'surface',
    gravityG: 0.38,
    gravitySource: 'nasa_planetary_facts',
    signal: 'minutes',
    helpText: 'Months',
    helpShort: 'months',
    helpSource: 'team',
    radiationText: 'Thin atmosphere, partial shelter',
    radiationSource: 'team',
  },
];

export const DEFAULT_PROFILE_ID = 'iss';

export const PROFILES_BY_ID = Object.fromEntries(MISSION_PROFILES.map((p) => [p.id, p]));

export const getProfile = (id) => PROFILES_BY_ID[id] ?? PROFILES_BY_ID[DEFAULT_PROFILE_ID];

/** "0.17 g"; "0 g" for weightless. */
export const gravityText = (profile) => `${profile.gravityG} g`;
