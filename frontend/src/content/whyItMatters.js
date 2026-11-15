// "Why it matters in space" and "What to do" for each reading. App guidance, not a clinical protocol.
// Wording comes from the project brief, word for word or lightly shortened: do not add facts, numbers,
// drugs or doses here.
//
// One entry per reading, keyed by a canonical id: { why, source, watch, alert }
//   source       an SRC key in content/limits.js, or 'team' (shown as "Team-set")
//   watch/alert  what to do for a watch / alert result: a list of steps. Readings that already had their
//                own steps (content/actions.js VITALS_STEPS) keep them; the rest use the team-set pattern.
// WHY_ID_OF maps every id the app uses for a reading (Vitals cards, check-in screens, drawer rows,
// Station tiles) to its canonical key, so no existing id changes.

import { VITALS_STEPS } from './actions.js';

const WATCH = ['Repeat the measurement at your next check-in. If it stays on watch for 2 days, tell the CMO.'];
const ALERT = ['Tell the CMO today. If you feel unwell now, use Emergency.'];
const CABIN_WATCH = ['Tell the crew; check the CO₂ scrubber and air flow.'];
const CABIN_ALERT = ['Tell the CMO and mission control now.'];

const own = (key) => ({ watch: VITALS_STEPS[key].watch, alert: VITALS_STEPS[key].alert });
const generic = { watch: WATCH, alert: ALERT };
const cabin = { watch: CABIN_WATCH, alert: CABIN_ALERT };

export const WHY_IT_MATTERS = {
  blood_pressure: {
    source: 'team',
    why: 'Without gravity, body fluids shift towards the head and the heart and blood vessels adapt. Blood pressure shows how well that system is coping, and whether you may feel faint when gravity returns.',
    ...own('blood_pressure'),
  },
  heart_rate: {
    source: 'team',
    why: 'A rising resting heart rate can be an early sign of illness, poor sleep, stress or loss of fitness, all of which are harder to spot in a small crew far from a hospital.',
    ...own('heart_rate'),
  },
  glucose: {
    source: 'team',
    why: 'Long stays in weightlessness can change how the body handles sugar. Continuous glucose monitors have now been worn by crew on the station to study this.',
    ...own('glucose'),
  },
  temperature: {
    source: 'stahn_2017',
    why: 'Astronauts’ core body temperature rises over long missions, by about 1 °C in one study, so a fever has to be judged against your own usual value in space, not an Earth average.',
    ...own('temperature'),
  },
  sleep_hours: {
    source: 'barger_2014',
    why: 'Crew on the station often sleep about 6 hours a night or less, because of noise, light, workload and no normal day–night cycle. Short sleep affects attention and mistakes.',
    ...own('sleep_hours'),
  },
  mood: {
    source: 'nasa_hrp_hazards',
    why: 'Isolation and confinement are one of NASA’s five hazards of spaceflight. Small changes in mood and social contact are easier to act on early.',
    ...own('mood'),
  },
  reaction_time: {
    source: 'team',
    why: 'Reaction time slows with short sleep, stress and high CO₂, and quick reactions matter for spacewalks, docking and emergencies.',
    ...generic,
  },
  grip_strength: {
    source: 'team',
    why: 'Without gravity, the muscles that hold you up lose strength. Grip strength is a quick check that exercise is keeping up.',
    ...generic,
  },
  bone_density: {
    source: 'team',
    why: 'Weight-bearing bones such as the hip and spine lose mineral in weightlessness, often quoted as about 1–1.5% a month, which raises fracture risk after landing.',
    ...generic,
  },
  radiation: {
    source: 'nasa_std_3001_v1',
    why: 'Outside Earth’s protection, crew receive much more radiation, which raises long-term cancer risk. NASA limits each astronaut’s career dose to 600 mSv.',
    ...generic,
  },
  stand_test: {
    source: 'team',
    why: 'After weightlessness, the body can struggle to keep blood pressure up when standing. This matters on landing and when arriving on the Moon or Mars.',
    ...generic,
  },
  cabin_co2: {
    source: 'nasa_co2_std',
    why: 'CO₂ builds up in closed cabins and can cause headaches and slower thinking even below levels that are dangerous on Earth.',
    ...cabin,
  },
  cabin_temperature: {
    source: 'team',
    why: 'A cabin that is too warm or too cold disturbs sleep and makes exercise harder to recover from.',
    ...cabin,
  },
  cabin_humidity: {
    source: 'team',
    why: 'Air that is too dry irritates eyes and airways; air that is too humid lets water collect on cold surfaces and mould grow in a closed cabin.',
    ...cabin,
  },
};

/** Every id the app uses for a reading → its WHY_IT_MATTERS key. */
export const WHY_ID_OF = {
  // Vitals / Today cards (lib/personCards.js CARD_DEFS, lib/fitness.js) and drawer rows (mocks/regions.js)
  'blood-pressure': 'blood_pressure',
  'heart-rate': 'heart_rate',
  'core-temperature': 'temperature',
  sleep: 'sleep_hours',
  mood: 'mood',
  'reaction-time': 'reaction_time',
  'grip-strength': 'grip_strength',
  'fasting-glucose': 'glucose',
  'bone-density': 'bone_density',
  'cabin-co2': 'cabin_co2',
  // Check-in screens (constants/vitals.js VITALS_SCREENS)
  blood_pressure: 'blood_pressure',
  heart_rate: 'heart_rate',
  glucose: 'glucose',
  temperature: 'temperature',
  sleep_hours: 'sleep_hours',
  // Station tiles (views/Environment.jsx) and the stand test view
  radiation: 'radiation',
  cabin_co2: 'cabin_co2',
  cabin_temperature: 'cabin_temperature',
  cabin_humidity: 'cabin_humidity',
  stand_test: 'stand_test',
};

/**
 * Readings shown in the app with no "why" text yet (sample drawer rows and preflight fitness rows).
 * Listed so the test can prove every shown reading is either covered or knowingly left out.
 */
export const NO_WHY_TEXT = [
  'optic-nerve',
  'headache-reports',
  'cognitive-score',
  'icp-estimate',
  'blood-oxygen',
  'breathing-rate',
  'hydration',
  'calorie-intake',
  'kidney-stone-risk',
  'body-mass',
  'gut-symptoms',
  'leg-muscle-volume',
  'exercise-time',
  'joint-pain',
  'broad-jump-preflight',
  'sit-ups-preflight',
];

/** The entry for any reading id the app uses, or null. */
export const whyFor = (id) => WHY_IT_MATTERS[WHY_ID_OF[id] ?? id] ?? null;

/** First sentence only (the check-in and stand test lines, the drawer popover). */
export function firstSentence(text) {
  const m = /^.*?[.!?](?=\s|$)/.exec(text ?? '');
  return m ? m[0] : text ?? '';
}

/** "What to do" steps for a watch or alert result, or [] for normal / unknown. */
export function whatToDo(id, status) {
  const entry = whyFor(id);
  if (!entry || (status !== 'watch' && status !== 'alert')) return [];
  return entry[status];
}
