// The single home for every health limit in the app. Nothing else may hard-code a limit number:
// lib/rangeCheck.js, lib/standTest.js and the UI all read from here.
//
// One object per limit:
//   { indicator, level, value, unit, rule, source_name, source_url, team_set, ... }
//   level     'watch' | 'alert' set a status; 'guidance' is a target shown to the user only;
//             'definition' is a test-protocol value (stand test window, PVT-B).
//   rule      how a value is compared with `value`: '>=', '>', '<', '<='; 'symptom' / 'stopped'
//             are event rules for the stand test (value is the symptom id, or null).
//   team_set  true when the line is the team's choice, not a published clinical standard.
// Optional: label (short name), action (step shown first on the action card), crisis.
// source_short is the name used inside reason text, e.g. "above the AHA watch line".

const TEAM = { source_name: 'Team-set', source_short: 'team-set', source_url: null, team_set: true };

const SRC = {
  aha_bp: {
    source_short: 'AHA',
    source_name: 'American Heart Association',
    source_title: 'Understanding Blood Pressure Readings',
    source_url: 'https://heart.org/bplevels',
  },
  aha_hr: {
    source_short: 'AHA',
    source_name: 'American Heart Association',
    source_title: 'All About Heart Rate (Pulse)',
    source_url:
      'https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse',
  },
  ada: {
    source_short: 'ADA',
    source_name: 'American Diabetes Association',
    source_title: 'Standards of Care in Diabetes',
    source_url: 'https://professional.diabetes.org/standards-of-care',
  },
  cc_fever: {
    source_short: 'Cleveland Clinic',
    source_name: 'Cleveland Clinic',
    source_title: 'Fever: What Is Considered a Fever?',
    source_url: 'https://my.clevelandclinic.org/health/articles/10880-fever',
  },
  cdc_fever: {
    source_short: 'CDC',
    source_name: 'CDC',
    source_title: 'Definitions of Signs, Symptoms, and Conditions of Ill Travelers (fever)',
    source_url: 'https://www.cdc.gov/quarantine/maritime/definitions-signs-symptoms-conditions-ill-travelers.html',
  },
  cc_hypothermia: {
    source_short: 'Cleveland Clinic',
    source_name: 'Cleveland Clinic',
    source_title: 'Hypothermia (Low Body Temperature)',
    source_url: 'https://my.clevelandclinic.org/health/diseases/21164-hypothermia-low-body-temperature',
  },
  aasm: {
    source_short: 'AASM/SRS',
    source_name: 'AASM/SRS consensus',
    source_title: 'Recommended Amount of Sleep for a Healthy Adult (AASM and Sleep Research Society)',
    source_url: 'https://www.aasm.org/resources/pdf/adultsleepdurationconsensus.pdf',
  },
  freeman: {
    source_short: 'Freeman et al.',
    source_name: 'Freeman et al. 2011',
    source_title:
      'Consensus statement on the definition of orthostatic hypotension, neurally mediated syncope and the postural tachycardia syndrome. Clin Auton Res 21:69–72',
    source_url: 'https://doi.org/10.1007/s10286-011-0119-5',
  },
  basner: {
    source_short: 'Basner et al.',
    source_name: 'Basner, Mollicone & Dinges 2011',
    source_title:
      'Validity and sensitivity of a brief psychomotor vigilance test (PVT-B) to total and partial sleep deprivation. Acta Astronautica 69:949–959',
    source_url: 'https://doi.org/10.1016/j.actaastro.2011.07.015',
  },
};

const cited = (key) => ({ ...SRC[key], team_set: false });

export const CRISIS_ACTION = 'Tell the Crew Medical Officer now';

export const LIMITS = [
  // ---- Blood pressure (resting) ----
  { indicator: 'systolic_bp', level: 'watch', value: 130, unit: 'mmHg', rule: '>=', ...cited('aha_bp') },
  { indicator: 'systolic_bp', level: 'alert', value: 140, unit: 'mmHg', rule: '>=', ...cited('aha_bp') },
  { indicator: 'systolic_bp', level: 'alert', value: 180, unit: 'mmHg', rule: '>', label: 'Hypertensive crisis', crisis: true, action: CRISIS_ACTION, ...cited('aha_bp') },
  { indicator: 'systolic_bp', level: 'watch', value: 90, unit: 'mmHg', rule: '<', label: 'Low', ...TEAM },
  { indicator: 'systolic_bp', level: 'alert', value: 80, unit: 'mmHg', rule: '<', label: 'Low', ...TEAM },
  { indicator: 'diastolic_bp', level: 'watch', value: 80, unit: 'mmHg', rule: '>=', ...cited('aha_bp') },
  { indicator: 'diastolic_bp', level: 'alert', value: 90, unit: 'mmHg', rule: '>=', ...cited('aha_bp') },
  { indicator: 'diastolic_bp', level: 'alert', value: 120, unit: 'mmHg', rule: '>', label: 'Hypertensive crisis', crisis: true, action: CRISIS_ACTION, ...cited('aha_bp') },
  { indicator: 'diastolic_bp', level: 'watch', value: 60, unit: 'mmHg', rule: '<', label: 'Low', ...TEAM },
  { indicator: 'diastolic_bp', level: 'alert', value: 50, unit: 'mmHg', rule: '<', label: 'Low', ...TEAM },

  // ---- Fasting blood sugar ----
  { indicator: 'fasting_glucose', level: 'watch', value: 100, unit: 'mg/dL', rule: '>=', ...cited('ada') },
  { indicator: 'fasting_glucose', level: 'alert', value: 126, unit: 'mg/dL', rule: '>=', ...cited('ada') },
  { indicator: 'fasting_glucose', level: 'watch', value: 70, unit: 'mg/dL', rule: '<', label: 'Low', ...cited('ada') },
  { indicator: 'fasting_glucose', level: 'alert', value: 54, unit: 'mg/dL', rule: '<', label: 'Low', ...cited('ada') },

  // ---- Body temperature ----
  { indicator: 'temperature', level: 'watch', value: 37.5, unit: '°C', rule: '>=', label: 'Low-grade fever', ...cited('cc_fever') },
  { indicator: 'temperature', level: 'alert', value: 38.0, unit: '°C', rule: '>=', label: 'Fever', ...cited('cdc_fever') },
  { indicator: 'temperature', level: 'watch', value: 36.0, unit: '°C', rule: '<', label: 'Low', ...TEAM },
  { indicator: 'temperature', level: 'alert', value: 35.0, unit: '°C', rule: '<', label: 'Hypothermia', ...cited('cc_hypothermia') },

  // ---- Resting heart rate ----
  { indicator: 'resting_hr', level: 'watch', value: 100, unit: 'bpm', rule: '>', ...cited('aha_hr') },
  { indicator: 'resting_hr', level: 'alert', value: 120, unit: 'bpm', rule: '>', ...TEAM },
  { indicator: 'resting_hr', level: 'watch', value: 50, unit: 'bpm', rule: '<', label: 'Low', ...TEAM },
  { indicator: 'resting_hr', level: 'alert', value: 40, unit: 'bpm', rule: '<', label: 'Low', ...TEAM },

  // ---- Sleep duration (hours per night) ----
  { indicator: 'sleep_hours', level: 'watch', value: 6.0, unit: 'h', rule: '<=', ...cited('aasm') },
  { indicator: 'sleep_hours', level: 'alert', value: 4.5, unit: 'h', rule: '<', ...TEAM },
  { indicator: 'sleep_hours', level: 'guidance', value: 7, unit: 'h', rule: '>=', label: 'Target', ...cited('aasm') },

  // ---- Mood (self-rated, 1 = very low … 5 = very good) ----
  // Team-set floor: a 1 shows as watch even when it is "usual" for that person.
  { indicator: 'mood', level: 'watch', value: 1, unit: '/ 5', rule: '<=', label: 'Very low', ...TEAM },

  // ---- Stand test (change from lying down to standing) ----
  { indicator: 'stand_systolic_drop', level: 'alert', value: 20, unit: 'mmHg', rule: '>=', label: 'Systolic drop', ...cited('freeman') },
  { indicator: 'stand_systolic_drop', level: 'watch', value: 10, unit: 'mmHg', rule: '>=', label: 'Systolic drop', ...TEAM },
  { indicator: 'stand_diastolic_drop', level: 'alert', value: 10, unit: 'mmHg', rule: '>=', label: 'Diastolic drop', ...cited('freeman') },
  { indicator: 'stand_diastolic_drop', level: 'watch', value: 5, unit: 'mmHg', rule: '>=', label: 'Diastolic drop', ...TEAM },
  { indicator: 'stand_hr_rise', level: 'alert', value: 30, unit: 'bpm', rule: '>=', label: 'Heart-rate rise', ...cited('freeman') },
  { indicator: 'stand_hr_rise', level: 'watch', value: 15, unit: 'bpm', rule: '>=', label: 'Heart-rate rise', ...TEAM },
  { indicator: 'stand_test', level: 'definition', value: 3, unit: 'min', rule: '=', label: 'Standing readings taken within', ...cited('freeman') },
  { indicator: 'stand_test', level: 'alert', value: 'felt_faint', unit: null, rule: 'symptom', label: 'Felt faint', ...TEAM },
  { indicator: 'stand_test', level: 'alert', value: null, unit: null, rule: 'stopped', label: 'Test stopped early', ...TEAM },
  { indicator: 'stand_test', level: 'watch', value: 'any', unit: null, rule: 'symptom', label: 'Any other symptom', ...TEAM },

  // ---- Reaction test (PVT-B) ----
  { indicator: 'reaction_test', level: 'definition', value: 3, unit: 'min', rule: '=', label: 'Test length', ...cited('basner') },
  { indicator: 'reaction_test', level: 'definition', value: 1, unit: 's', rule: '=', label: 'Shortest gap between stimuli', ...cited('basner') },
  { indicator: 'reaction_test', level: 'definition', value: 4, unit: 's', rule: '=', label: 'Longest gap between stimuli', ...cited('basner') },
  { indicator: 'reaction_test', level: 'definition', value: 355, unit: 'ms', rule: '>=', label: 'Lapse = response', ...cited('basner') },
  { indicator: 'reaction_test', level: 'definition', value: 100, unit: 'ms', rule: '<', label: 'False start = response', ...cited('basner') },
];

/** Every limit for one indicator, in table order. */
export const limitsFor = (indicator) => LIMITS.filter((l) => l.indicator === indicator);

/** One limit, looked up by indicator, level and (optionally) label. Throws if missing so typos fail loudly. */
export function limitOf(indicator, level, label) {
  const hit = LIMITS.find((l) => l.indicator === indicator && l.level === level && (label === undefined || l.label === label));
  if (!hit) throw new Error(`No ${level} limit for ${indicator}${label ? ` (${label})` : ''} in content/limits.js`);
  return hit;
}

const defn = (indicator, label) => limitOf(indicator, 'definition', label).value;

/** Stand test, in the shapes lib/standTest.js uses. A value at or above a cut-off counts. */
export const STAND_TEST = {
  alert: {
    systolicDrop: limitOf('stand_systolic_drop', 'alert').value,
    diastolicDrop: limitOf('stand_diastolic_drop', 'alert').value,
    hrRise: limitOf('stand_hr_rise', 'alert').value,
  },
  watch: {
    systolicDrop: limitOf('stand_systolic_drop', 'watch').value,
    diastolicDrop: limitOf('stand_diastolic_drop', 'watch').value,
    hrRise: limitOf('stand_hr_rise', 'watch').value,
  },
  windowMinutes: defn('stand_test', 'Standing readings taken within'),
  alertSymptoms: LIMITS.filter((l) => l.indicator === 'stand_test' && l.rule === 'symptom' && l.level === 'alert').map((l) => l.value),
  stoppedLevel: limitOf('stand_test', 'alert', 'Test stopped early').level,
  otherSymptomLevel: limitOf('stand_test', 'watch', 'Any other symptom').level,
};

/** PVT-B (brief psychomotor vigilance test), in milliseconds where it matters. */
export const PVT_B = {
  durationMs: defn('reaction_test', 'Test length') * 60 * 1000,
  gapMinMs: defn('reaction_test', 'Shortest gap between stimuli') * 1000,
  gapMaxMs: defn('reaction_test', 'Longest gap between stimuli') * 1000,
  lapseMs: defn('reaction_test', 'Lapse = response'),
  falseStartMs: defn('reaction_test', 'False start = response'),
};

/** Every cited source once, in first-use order: { name, title, url, indicators[] }. */
export const SOURCES = (() => {
  const byUrl = new Map();
  for (const l of LIMITS) {
    if (l.team_set || !l.source_url) continue;
    const entry = byUrl.get(l.source_url) ?? { name: l.source_name, title: l.source_title, url: l.source_url, indicators: [] };
    if (!entry.indicators.includes(l.indicator)) entry.indicators.push(l.indicator);
    byUrl.set(l.source_url, entry);
  }
  return [...byUrl.values()];
})();

/** Plain names for indicator ids, for the info panels and the Sources list. */
export const INDICATOR_NAMES = {
  systolic_bp: 'Systolic BP',
  diastolic_bp: 'Diastolic BP',
  fasting_glucose: 'Fasting blood sugar',
  temperature: 'Body temperature',
  resting_hr: 'Resting heart rate',
  sleep_hours: 'Sleep duration',
  mood: 'Mood',
  stand_systolic_drop: 'Stand test: systolic drop',
  stand_diastolic_drop: 'Stand test: diastolic drop',
  stand_hr_rise: 'Stand test: heart-rate rise',
  stand_test: 'Stand test',
  reaction_test: 'Reaction test (PVT-B)',
};
