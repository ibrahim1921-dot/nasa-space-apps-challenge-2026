// Knowledge hub: one entry per health indicator, ASSEMBLED ONLY FROM TEXT ALREADY IN THE APP.
//   why / source  content/whyItMatters.js
//   how measured  constants/vitals.js (the check-in how-to screens)
//   limits / refs content/limits.js
// Where the app has no text yet, the field is TODO (rendered as "TODO: content"). Do not invent health
// facts here: add them to the source files above with a citation, or fill the TODO with reviewed text.

import { WHY_IT_MATTERS, whatToDo } from './whyItMatters.js';
import { INDICATOR_NAMES, limitsFor, sourceFor } from './limits.js';
import { VITALS_SCREENS } from '../constants/vitals.js';

export const TODO = 'TODO: content';

/**
 * id: frontend id (also the folder under public/health-education/)
 * code: the backend indicator code (migration V22), for linking to alerts
 */
const DEFS = [
  { id: 'heart-rate', title: 'Heart rate', code: 'heart_rate', why: 'heart_rate', limits: ['resting_hr'], howTo: 'heart_rate' },
  { id: 'blood-pressure', title: 'Blood pressure', code: 'blood_pressure', why: 'blood_pressure', limits: ['systolic_bp', 'diastolic_bp'], howTo: 'blood_pressure' },
  { id: 'blood-glucose', title: 'Blood glucose', code: 'blood_sugar', why: 'glucose', limits: ['fasting_glucose'], howTo: 'glucose' },
  { id: 'body-temperature', title: 'Body temperature', code: 'body_temperature', why: 'temperature', limits: ['temperature'], howTo: 'temperature' },
  { id: 'sleep', title: 'Sleep', code: 'sleep_hours', why: 'sleep_hours', limits: ['sleep_hours'], howTo: 'sleep_hours' },
  { id: 'mood', title: 'Mood', code: 'mood', why: 'mood', limits: ['mood'], howTo: 'mood' },
  { id: 'muscle-health', title: 'Muscle health', code: 'muscle', why: 'grip_strength', limits: ['grip_drop'], howTo: null },
  { id: 'bone-density', title: 'Bone density', code: 'bone_mineral_density', why: 'bone_density', limits: [], howTo: null },
  { id: 'radiation', title: 'Radiation', code: 'cumulative_absorbed_radiation_dose', why: 'radiation', limits: [], howTo: null },
];

const HOW_LABELS = { posture: 'How to take it', timing: 'When', skew: 'What can skew it' };

function sourceEntry(src) {
  if (!src) return null;
  return { name: src.source_name, title: src.source_title ?? null, url: src.source_url ?? null, teamSet: Boolean(src.team_set) };
}

function referencesFor(def) {
  const seen = new Map();
  const add = (s) => {
    if (!s) return;
    const key = `${s.name}|${s.url ?? s.title ?? ''}`;
    if (!seen.has(key)) seen.set(key, s);
  };
  add(sourceEntry(sourceFor(WHY_IT_MATTERS[def.why]?.source)));
  for (const indicator of def.limits) for (const l of limitsFor(indicator)) add(sourceEntry(l));
  return [...seen.values()];
}

function build(def) {
  const why = WHY_IT_MATTERS[def.why];
  const screen = def.howTo ? VITALS_SCREENS.find((s) => s.id === def.howTo) : null;
  return {
    id: def.id,
    title: def.title,
    code: def.code,
    whatItMeasures: TODO,
    whyInSpace: why?.why ?? TODO,
    howMeasured: screen ? Object.entries(screen.howTo).map(([k, text]) => ({ label: HOW_LABELS[k] ?? k, text })) : TODO,
    spaceflightEffects: TODO,
    limits: def.limits.flatMap((indicator) =>
      limitsFor(indicator)
        .filter((l) => l.level === 'watch' || l.level === 'alert')
        .map((l) => ({
          name: INDICATOR_NAMES[indicator] ?? indicator,
          level: l.level,
          text: `${l.label ? `${l.label}: ` : ''}${l.rule} ${l.value}${l.unit ? ` ${l.unit}` : ''}`,
          source: l.team_set ? 'Team-set' : l.source_name,
        })),
    ),
    appSteps: { watch: whatToDo(def.why, 'watch'), alert: whatToDo(def.why, 'alert') },
    countermeasures: [
      {
        id: `${def.id}-1`,
        title: TODO,
        description: TODO,
        image: `/health-education/${def.id}/placeholder.svg`,
        imageAlt: 'Placeholder image',
        video: null,
        source: null,
      },
    ],
    references: referencesFor(def),
  };
}

export const KNOWLEDGE = DEFS.map(build);

export const knowledgeFor = (id) => KNOWLEDGE.find((k) => k.id === id) ?? null;
