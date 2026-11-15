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

// Spacecraft cabin air (NASA-STD-3001 and its OCHMO technical briefs).
SRC.csa_muscle = {
  source_short: 'Canadian Space Agency',
  source_name: 'Canadian Space Agency',
  source_title: 'What happens to muscles in space? (up to 20% loss of muscle mass on flights of 5 to 11 days)',
  source_url: 'https://asc-csa.gc.ca/eng/sciences/osm/muscles.asp',
};
SRC.nasa_co2_std = {
  source_short: 'NASA-STD-3001',
  source_name: 'NASA-STD-3001 Volume 2 [V2 6004]',
  source_title: 'NASA-STD-3001 Vol. 2, 6.0 Natural and Induced Environments: average 1-hour CO2 at most 3 mmHg',
  source_url: 'https://www.nasa.gov/reference/6-0-natural-and-induced-environments-vol-2',
};
SRC.nasa_co2_tb = {
  source_short: 'NASA OCHMO',
  source_name: 'NASA OCHMO-TB-004 Carbon Dioxide',
  source_title: 'Carbon Dioxide technical brief: 7-day average below 2.5 mmHg keeps headache risk below 1%',
  source_url: 'https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/',
};
SRC.nasa_eclss = {
  source_short: 'NASA OCHMO',
  source_name: 'NASA OCHMO-TB-002 ECLSS',
  source_title: 'Environmental Control & Life Support System technical brief: operating limit 18 °C/75% to 27 °C/25% humidity',
  source_url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-002-eclss.pdf',
};
// "Why it matters in space" sources (content/whyItMatters.js). Not health limits: no LIMITS entry uses them.
SRC.stahn_2017 = {
  source_short: 'Stahn 2017',
  source_name: 'Stahn A.C. et al. (2017), Scientific Reports 7:16180',
  source_title: 'Increased core body temperature in astronauts during long-duration space missions',
  source_url: null,
};
SRC.barger_2014 = {
  source_short: 'Barger 2014',
  source_name: 'Barger L.K. et al. (2014), Lancet Neurology 13:904–912',
  source_title: 'Prevalence of sleep deficiency and use of hypnotic drugs in astronauts before, during, and after spaceflight',
  source_url: null,
};
SRC.nasa_hrp_hazards = {
  source_short: 'NASA HRP',
  source_name: 'NASA Human Research Program',
  source_title: 'Five hazards of human spaceflight',
  source_url: 'https://www.nasa.gov/hrp/hazards',
};
SRC.nasa_std_3001_v1 = {
  source_short: 'NASA-STD-3001 Vol. 1',
  source_name: 'NASA-STD-3001 Volume 1 (crew health)',
  source_title: 'NASA-STD-3001 Volume 1, crew health, including the 600 mSv career effective dose limit',
  source_url: null,
};
// Activities source (Dock Pilot "Why it helps", content/activities.js). Not a health limit: no LIMITS entry uses it.
SRC.nasa_hrp_sensorimotor = {
  source_short: 'NASA HRP',
  source_name: 'NASA Human Research Program',
  source_title:
    'Risk of Impaired Control of Spacecraft/Associated Systems and Decreased Mobility Due to Vestibular/Sensorimotor Alterations Associated with Space Flight',
  source_url: null,
};
// Emergency guide sources (content/emergency.js). Not health limits: no LIMITS entry uses them.
SRC.cpr_micro_2020 = {
  source_short: 'Microgravity CPR guideline 2020',
  source_name: 'Hinkelbein J. et al. (2020), Scand J Trauma Resusc Emerg Med 28:108',
  source_title:
    'Cardiopulmonary resuscitation (CPR) during spaceflight – a guideline for CPR in microgravity from the German Society of Aerospace Medicine (DGLRM) and the European Society of Aerospace Medicine Space Medicine Group (ESAM-SMG)',
  source_url: 'https://doi.org/10.1186/s13049-020-00793-y',
};
SRC.aha_erc = {
  source_short: 'AHA/ERC',
  source_name: 'AHA / ERC adult basic life support guidelines',
  source_title: 'Adult basic life support: compression rate 100–120 per minute, depth 5–6 cm, AED as soon as available',
  source_url: 'https://cpr.heart.org/en/resuscitation-science/cpr-and-ecc-guidelines',
  source_urls: [
    { label: 'American Heart Association: CPR and ECC guidelines', url: 'https://cpr.heart.org/en/resuscitation-science/cpr-and-ecc-guidelines' },
    { label: 'European Resuscitation Council guidelines', url: 'https://cprguidelines.eu' },
  ],
};
// Mission environment source (constants/mission.js gravity line). Not a health limit: no LIMITS entry uses it.
SRC.nasa_planetary_facts = {
  source_short: 'NASA Planetary Fact Sheet',
  source_name: 'NASA Planetary Fact Sheet',
  source_title: 'NASA Planetary Fact Sheet: surface gravity of the Moon (about 0.17 g) and Mars (about 0.38 g)',
  source_url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
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

  // ---- Grip strength: drop from the person's own preflight value, in % ----
  // Watch is the team's choice (half the cited figure); alert is the CSA's "up to 20% loss of muscle mass".
  { indicator: 'grip_drop', level: 'watch', value: 10, unit: '%', rule: '>=', ...TEAM },
  { indicator: 'grip_drop', level: 'alert', value: 20, unit: '%', rule: '>=', ...cited('csa_muscle') },

  // ---- Cabin air (station environment, not a crew member's reading) ----
  { indicator: 'cabin_co2_1h', level: 'alert', value: 3, unit: 'mmHg', decimals: 1, rule: '>', ...cited('nasa_co2_std') },
  { indicator: 'cabin_co2_7d', level: 'watch', value: 2.5, unit: 'mmHg', decimals: 1, rule: '>=', ...cited('nasa_co2_tb') },
  { indicator: 'cabin_temp', level: 'alert', value: 27, unit: '°C', rule: '>', ...cited('nasa_eclss') },
  { indicator: 'cabin_temp', level: 'alert', value: 18, unit: '°C', rule: '<', label: 'Low', ...cited('nasa_eclss') },
  { indicator: 'cabin_rh', level: 'alert', value: 75, unit: '%', rule: '>', ...cited('nasa_eclss') },
  { indicator: 'cabin_rh', level: 'alert', value: 25, unit: '%', rule: '<', label: 'Low', ...cited('nasa_eclss') },

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
  grip_drop: 'Grip strength: drop from preflight',
  cabin_co2_1h: 'Cabin CO₂ (1-hour average)',
  cabin_co2_7d: 'Cabin CO₂ (7-day average)',
  cabin_temp: 'Cabin temperature',
  cabin_rh: 'Cabin humidity',
};

/** Sources of the emergency guide steps (content/emergency.js), by step `source` key. 'team' is Team-set. */
export const EMERGENCY_SOURCES = {
  aha_erc: { key: 'aha_erc', ...SRC.aha_erc, team_set: false },
  cpr_micro_2020: { key: 'cpr_micro_2020', ...SRC.cpr_micro_2020, team_set: false },
  team: { key: 'team', ...TEAM, source_short: 'Team-set' },
};

/** Looks up a source by SRC key for the "Why it matters in space" panels; 'team' is Team-set. Null if unknown. */
export const sourceFor = (key) => (key === 'team' ? { key, ...TEAM } : SRC[key] ? { key, ...SRC[key], team_set: false } : null);
