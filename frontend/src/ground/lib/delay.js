// Signal delay between the crew and Earth. Every delay comes from the mission profile in
// constants/mission.js (chosen in the crew app header, ahm.missionProfile.v1); none is set here.

import { DEFAULT_PROFILE_ID, PROFILES_BY_ID, getProfile } from '../../constants/mission.js';

export const PROFILE_KEY = 'ahm.missionProfile.v1';

/** The mission profile saved by the crew app (JSON string id); the default profile if missing or unknown. */
export function profileFrom(storage) {
  try {
    const v = JSON.parse(storage?.getItem(PROFILE_KEY) ?? 'null');
    return getProfile(typeof v === 'string' && v in PROFILES_BY_ID ? v : DEFAULT_PROFILE_ID);
  } catch {
    return getProfile(DEFAULT_PROFILE_ID);
  }
}

/** One-way delay in milliseconds. */
export const oneWayMs = (profile) => Math.round((profile?.delaySeconds ?? 0) * 1000);

const shift = (iso, ms) => (typeof iso === 'string' && !Number.isNaN(Date.parse(iso)) ? new Date(Date.parse(iso) + ms).toISOString() : null);

/** When a record made onboard reached Earth: recorded time + one-way delay. */
export const arrivedOnEarthAt = (recordedAt, profile) => shift(recordedAt, oneWayMs(profile));

/** When a message sent from Earth reaches the crew: sent time + one-way delay. */
export const arrivesOnboardAt = (sentAt, profile) => shift(sentAt, oneWayMs(profile));

/** "0 s", "1.3 s", "20 min", "1 h 5 min". */
export function durationText(ms) {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${Math.round(s * 10) / 10} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

/** "Mars transit · signal about 20 min one way" */
export const delayLabel = (profile) => `${profile.label} · signal about ${durationText(oneWayMs(profile))} one way`;

const pad = (n) => String(n).padStart(2, '0');

/** UTC clock time; with seconds when the delay is under a minute (so the two times can differ). */
export function clockText(iso, { seconds = false } = {}) {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds ? `:${pad(d.getUTCSeconds())}` : ''}`;
}

/** "31 Oct" (UTC) */
export const dateText = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "Recorded 14:02 onboard · reached Earth 14:22 (UTC)" */
export function timesText(recordedAt, profile) {
  const ms = oneWayMs(profile);
  const seconds = ms > 0 && ms < 60_000;
  const arrived = arrivedOnEarthAt(recordedAt, profile);
  if (!arrived) return '';
  const nextDay = arrived.slice(0, 10) !== recordedAt.slice(0, 10) ? ` ${dateText(arrived)}` : '';
  return `Recorded ${clockText(recordedAt, { seconds })} onboard · reached Earth${nextDay} ${clockText(arrived, { seconds })} (UTC)`;
}

/** "Sent 14:02 · reaches crew 14:22 (UTC)" */
export function sentText(sentAt, profile) {
  const ms = oneWayMs(profile);
  const seconds = ms > 0 && ms < 60_000;
  return `Sent ${clockText(sentAt, { seconds })} · reaches crew ${clockText(arrivesOnboardAt(sentAt, profile), { seconds })} (UTC)`;
}
