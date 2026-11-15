// Emergency guide text: "crewmate has chest pain, then collapses".
// Medical wording is taken from the project brief, word for word or lightly shortened. Do not add drugs,
// doses, diagnoses or steps here: changes need the team's medical review.
//
// Each step: { id, text, source, who?, action? }
//   source  'aha_erc' | 'cpr_micro_2020' | 'team'  (content/limits.js EMERGENCY_SOURCES; 'team' = Team-set)
//   who     'cmo' when the step is for the Crew Medical Officer
//   action  a button the screen shows for this step: 'alert' | 'collapsed' | 'exam' | 'delay' | 'position'

export const FLOWS = {
  chest_pain: { id: 'chest_pain', label: 'Chest pain, awake', short: 'chest pain' },
  collapse: { id: 'collapse', label: 'Collapsed / not responding', short: 'collapsed' },
};

export const ENVIRONMENTS = {
  station: { id: 'station', label: 'Space station' },
  spacecraft: { id: 'spacecraft', label: 'Spacecraft (small cabin)' },
  moon: { id: 'moon', label: 'Moon or Mars base (partial gravity)' },
};

/** Flow 1: chest pain, the person is awake. */
export const CHEST_PAIN_STEPS = [
  {
    id: 'rest',
    source: 'team',
    text: 'Stop what they are doing. Help them rest, held in place (strap or restraint on the station or spacecraft, seated on the Moon).',
  },
  { id: 'alert', source: 'team', action: 'alert', text: 'Press “Alert the CMO”.' },
  {
    id: 'stay',
    source: 'team',
    action: 'collapsed',
    text: 'Stay with them. If they stop responding or are not breathing normally, press “They collapsed”.',
  },
  { id: 'exam', source: 'team', who: 'cmo', action: 'exam', text: 'CMO: record an exam (blood pressure, heart rate).' },
  { id: 'surgeon', source: 'team', who: 'cmo', action: 'delay', text: 'CMO: contact the flight surgeon.' },
  { id: 'medicines', source: 'team', text: 'Medicines only as directed by the CMO or the flight surgeon.' },
];

/** Flow 2: collapsed / not responding. Steps 1–3 are screens; 4–10 are shown on the CPR screen. */
// A CPR step may carry `notes: [{ id, text, source, environments? }]`: extra lines with their own source
// label, shown only in the listed environments (all environments when `environments` is left out).
export const COLLAPSE_STEPS = [
  { id: 'check', source: 'aha_erc', text: 'Check: do they respond? Are they breathing normally? Take no more than 10 seconds.' },
  { id: 'shout', source: 'aha_erc', action: 'alert', text: 'Shout for help and press “Alert the crew”. The app alerts the CMO.' },
  { id: 'start', source: 'aha_erc', action: 'position', text: 'Start chest compressions now. Position depends on where you are:' },
];

export const CPR_STEPS = [
  { id: 'push', source: 'aha_erc', text: 'Push hard and fast: 100–120 a minute, 5–6 cm deep, with full recoil. Follow the beat on screen.' },
  {
    id: 'breaths',
    source: 'aha_erc',
    text: 'If you are trained: 30 compressions, then 2 breaths. If not: keep doing compressions.',
    notes: [
      {
        id: 'airway_micro',
        source: 'cpr_micro_2020',
        environments: ['station', 'spacecraft'],
        text: 'In weightlessness, give breaths or use an airway device only when the person is restrained and two rescuers are present. Until then, keep doing compressions.',
      },
    ],
  },
  {
    id: 'aed',
    source: 'aha_erc',
    text: 'Send someone for the defibrillator (AED). Switch it on and follow its voice prompts as soon as it arrives.',
    notes: [{ id: 'aed_clear', source: 'team', text: 'During a shock nobody touches the person, or anything metal they are touching.' }],
  },
  { id: 'surgeon', source: 'team', who: 'cmo', action: 'delay', text: 'CMO: contact the flight surgeon.' },
  { id: 'swap', source: 'aha_erc', text: 'Swap the person doing compressions every 2 minutes. The app shows a swap timer.' },
  {
    id: 'continue',
    source: 'aha_erc',
    text: 'Keep going until they start breathing normally, or the CMO or flight surgeon tells you to stop.',
  },
  {
    id: 'watch',
    source: 'team',
    text: 'Stay with them and keep them held in place. Keep checking their breathing. If it stops, start compressions again.',
  },
];

/** Total Flow 2 steps (the step screens plus the CPR screen). */
export const COLLAPSE_TOTAL = COLLAPSE_STEPS.length + CPR_STEPS.length;

/** The CPR step shown after "Breathing normally" is pressed. */
export const AFTER_BREATHING_STEP = 'watch';

/** Index of a CPR step by id (-1 if unknown). */
export const cprStepIndex = (id) => CPR_STEPS.findIndex((s) => s.id === id);

/** A step's notes that apply in this environment. */
export const notesFor = (step, environment) => (step.notes ?? []).filter((n) => !n.environments || n.environments.includes(environment));

/** Compression position by environment. `figure` picks the inline SVG (components/CprFigure.jsx). */
export const POSITIONS = {
  station: [
    {
      id: 'er',
      source: 'cpr_micro_2020',
      figure: 'straddle',
      text: 'Start straight away with the Evetts-Russomano method. Wrap your legs around their body, cross your ankles behind their back, and compress with straight arms.',
    },
    {
      id: 'handstand',
      source: 'cpr_micro_2020',
      figure: 'handstand',
      text: 'When two people are free, strap them to the medical restraint and use the handstand method (feet braced on the wall opposite, arms straight).',
    },
  ],
  spacecraft: [
    {
      id: 'er',
      source: 'cpr_micro_2020',
      figure: 'straddle',
      text: 'Evetts-Russomano method. The handstand method needs room and a restraint, so use it only if both are available.',
    },
  ],
  moon: [
    {
      id: 'kneel',
      source: 'team',
      figure: 'kneel',
      text: 'Lay them on their back on the floor and give standard kneeling CPR. In partial gravity (one-sixth on the Moon, about a third on Mars) your body weight helps less, so lock your arms and push from your shoulders, and swap more often if you tire.',
      note: 'The 2020 microgravity guideline does not cover partial gravity; this step is team-set.',
    },
  ],
};

export const CMO_IS_PATIENT = 'The CMO is the patient. Contact the flight surgeon now.';

/** Event types and their plain labels (summary, live view). */
export const EVENT_LABELS = {
  started: 'Emergency started',
  alert_sent: 'Alert sent',
  switched_to_collapse: 'They collapsed',
  compressions_started: 'Compressions started',
  swap: 'Compressor swapped',
  aed_arrived: 'AED arrived',
  aed_shock: 'Shock given',
  breathing_normally: 'Breathing normally',
  stopped: 'Compressions stopped',
  note: 'Note',
};
