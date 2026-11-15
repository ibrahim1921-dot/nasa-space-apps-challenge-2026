// What the mission environment (constants/mission.js) changes in the app. Pure, so node:test covers
// every profile; the UI only renders what this returns. No limits or scoring live here.

import { DELAY_SOURCE_LABEL, getProfile, gravityText } from '../constants/mission.js';
import { durationText } from '../ground/lib/delay.js';

export const STAND_TEST_UNAVAILABLE =
  'Standing up has no effect in weightlessness. Do this test on landing day or at a surface base.';
export const HOWTO_WEIGHTLESS = 'Strap in or hold a handrail before measuring.';
export const HOWTO_SURFACE = 'Sit still for 5 minutes before measuring.';
export const ESCALATION_REALTIME = 'Mission control can help right away.';
export const ESCALATION_SECONDS = 'Mission control answers within seconds; follow the CMO’s lead.';
export const STATION_SAMPLE_CHIP = 'Sample: ISS data';

/** The how-to screens that get the environment line (the others are not posture-sensitive). */
export const HOWTO_SCREENS = ['blood_pressure', 'heart_rate', 'temperature'];

const isWeightless = (p) => p.gravityG === 0;

/** "Help from Earth takes at least 20 min each way. …" */
export const escalationMinutes = (p) =>
  `Help from Earth takes at least ${durationText(p.delaySeconds * 1000)} each way. The CMO leads; don’t wait for Earth in an emergency.`;

/**
 * @param {object|string} profileOrId  a profile from constants/mission.js, or its id
 * @returns {{
 *   standTest: { available: true, gravity: string } | { available: false, reason: string },
 *   howTo: string, escalation: string,
 *   stationData: { sample: boolean, chip: string|null, title: string },
 * }}
 */
export function environmentRules(profileOrId) {
  const p = typeof profileOrId === 'string' || !profileOrId ? getProfile(profileOrId) : profileOrId;
  const weightless = isWeightless(p);
  const sample = p.id !== 'iss'; // environment.json is ISS data (NASA RR-1)
  return {
    standTest: weightless ? { available: false, reason: STAND_TEST_UNAVAILABLE } : { available: true, gravity: gravityText(p) },
    howTo: weightless ? HOWTO_WEIGHTLESS : HOWTO_SURFACE,
    escalation: p.signal === 'realtime' ? ESCALATION_REALTIME : p.signal === 'seconds' ? ESCALATION_SECONDS : escalationMinutes(p),
    stationData: { sample, chip: sample ? STATION_SAMPLE_CHIP : null, title: sample ? 'Habitat environment' : 'Station environment' },
  };
}

/** "Earth answers in about 1.3 s" / "near real time" / "about 20 min". */
const answerText = (p) => (p.signal === 'realtime' ? 'Earth answers in near real time' : `Earth answers in about ${durationText(p.delaySeconds * 1000)}`);

/** Today's context line: "Moon base · 0.17 g · Earth answers in about 1.3 s · help is days away". */
export const contextLine = (profileOrId) => {
  const p = typeof profileOrId === 'string' || !profileOrId ? getProfile(profileOrId) : profileOrId;
  return `${p.title} · ${gravityText(p)} · ${answerText(p)} · help is ${p.helpShort} away`;
};

/**
 * The header panel rows: { id, label, value, source } where source is a content/limits.js key,
 * 'team' (Team-set), a plain label string, or null (no source line).
 */
export function environmentFacts(profileOrId) {
  const p = typeof profileOrId === 'string' || !profileOrId ? getProfile(profileOrId) : profileOrId;
  const settingLabel = { station: 'Space station', spacecraft: 'Spacecraft', surface: 'Surface base' }[p.setting];
  return [
    { id: 'setting', label: 'Setting', value: settingLabel, source: null },
    isWeightless(p)
      ? { id: 'gravity', label: 'Gravity', value: 'Weightless', source: null }
      : { id: 'gravity', label: 'Gravity', value: `About ${gravityText(p)}`, source: p.gravitySource },
    { id: 'delay', label: 'Signal delay to Earth', value: p.delayText, source: { label: DELAY_SOURCE_LABEL } },
    { id: 'help', label: 'Help / return to Earth', value: p.helpText, source: p.helpSource },
    { id: 'radiation', label: 'Radiation', value: p.radiationText, source: p.radiationSource },
  ];
}
