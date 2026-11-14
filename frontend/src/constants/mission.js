// Mission profiles and their one-way Earth signal delay.
// Delays are APPROXIMATE demo values: Moon is about 1.3 s; Mars really ranges from about
// 3 to 22 min one-way depending on where the planets are, and 20 min is used here.

export const MISSION_PROFILES = [
  {
    id: 'iss',
    label: 'ISS (low Earth orbit)',
    gravityArrival: false,
    delaySeconds: 0,
    delayText: 'about 0 s (near real time)',
  },
  {
    id: 'moon',
    label: 'Moon base',
    gravityArrival: true,
    delaySeconds: 1.3,
    delayText: 'about 1.3 s one-way (approximate)',
  },
  {
    id: 'mars',
    label: 'Mars transit',
    gravityArrival: true,
    delaySeconds: 20 * 60,
    delayText: 'about 20 min one-way (approximate demo value; real range about 3–22 min)',
  },
];

export const DEFAULT_PROFILE_ID = 'iss';

export const PROFILES_BY_ID = Object.fromEntries(MISSION_PROFILES.map((p) => [p.id, p]));

export const getProfile = (id) => PROFILES_BY_ID[id] ?? PROFILES_BY_ID[DEFAULT_PROFILE_ID];
