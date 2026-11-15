// Single data-access layer for the dashboard.
// Every function calls the app's own API routes (src/app/api), which serve mock data today.
// When the prediction model's API is ready, only the routes and this file should need to
// change; keep the return shapes.
//
// Offline-first: where the route only serves bundled data (crew, region indicators, seeded stand
// tests), a failed request falls back to the same data computed on this device, so the app
// keeps working with no network. PhysioNet nights and Inspiration4 labs have no device fallback.

import { crewMemberFor, crewRoster } from '../mocks/crew.js';
import { regionIndicators, regionStatuses } from '../mocks/regions.js';
import { applyRangeStatus } from '../lib/rangeCheck.js';
import { CRITERIA, PERSONAL_MARGIN, STAND_TEST_ENGINE_VERSION, evaluateStandTest } from '../lib/standTest.js';
import { preflightTestsOf, standFile } from '../data/bundled.js';
import environmentFile from '../data/environment.json';

/** Try the route; if the network or server is down, use the same data from this device. */
async function withDeviceFallback(remote, local) {
  try {
    return await remote();
  } catch (err) {
    const data = local();
    if (data === null || data === undefined) throw err;
    return data;
  }
}

async function request(path, init) {
  const response = await fetch(path, { cache: 'no-store', ...init });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed: ${response.status} ${response.statusText}`);
  }
  return body;
}

/**
 * One crew member's header details (ids, names and roles come from data/crew.json). Without a crewId
 * only `{ roster, lastUpdated }` comes back: there is no default person.
 * @returns {Promise<{ id, name, role, missionDay, totalMissionDays, roster: {id, name, role}[], lastUpdated }>}
 */
export async function getCrewMember(crewId) {
  const query = crewId ? `?crew=${encodeURIComponent(crewId)}` : '';
  return withDeviceFallback(
    () => request(`/api/crew${query}`),
    () => {
      const lastUpdated = new Date().toISOString();
      // Same shape as the server: no id → roster only, no default person.
      if (!crewId) return { roster: crewRoster, lastUpdated, fromDevice: true };
      const member = crewMemberFor(crewId);
      return member && { ...member, roster: crewRoster, lastUpdated, fromDevice: true };
    },
  );
}

/** Every indicator for one body region (5–7 items). @param {'head'|'chest'|'abdomen'|'limbs'} regionId @returns {Promise<Indicator[]>} */
export async function getRegionIndicators(regionId) {
  return withDeviceFallback(
    () => request(`/api/indicators?region=${encodeURIComponent(String(regionId))}`),
    () => regionIndicators[regionId]?.map(applyRangeStatus) ?? null,
  );
}

/** @returns {Promise<{ head, chest, abdomen, limbs }>} each 'normal' | 'watch' | 'alert' */
export async function getRegionStatuses() {
  return withDeviceFallback(() => request('/api/regions'), () => regionStatuses);
}

/** @param {object} payload check-in answers @returns {Promise<{ ok: true }>} */
export async function submitContextCheckin(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Check-in payload is missing');
  return request('/api/checkins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Stored scored nights (PhysioNet bidsleep), plus nights logged on this server instance.
 * @param {string} [subjectId]
 * @returns {Promise<{ source, method, thresholds, subjects: string[], count, nights: object[] }>}
 */
export async function getNights(subjectId) {
  const query = subjectId ? `?subject=${encodeURIComponent(subjectId)}` : '';
  return request(`/api/nights${query}`);
}

/**
 * Score one night against the person's history.
 * @param {{ subject_id, id?, date?, night: object, extra_history?: object[] }} payload
 * @returns {Promise<{ source, id, subject_id, logged_at, date, status, heart_rate_score, sleep_score, reason, history_used }>}
 */
export async function scoreTonight(payload) {
  return request('/api/nights/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Inspiration4 lab values with each person's preflight baseline.
 * @param {string} [analyte]
 * @returns {Promise<{ source, analytes: string[], count, rows: object[] }>}
 */
export async function getLabs(analyte) {
  const query = analyte ? `?analyte=${encodeURIComponent(analyte)}` : '';
  return request(`/api/labs${query}`);
}

/**
 * Seeded (synthetic) stand tests, each with its evaluation.
 * @param {string} [crewId]
 * @returns {Promise<{ source, note, protocol, engine_version, criteria, personal_margin, crew: object[], count, tests: object[] }>}
 */
export async function getStandTests(crewId) {
  const query = crewId ? `?crew=${encodeURIComponent(crewId)}` : '';
  return withDeviceFallback(
    () => request(`/api/stand-tests${query}`),
    () => {
      const tests = standFile.tests
        .filter((t) => crewId === undefined || t.crew_id === crewId)
        .map((t) => {
          const { status, reasons, changes } = evaluateStandTest(t, preflightTestsOf(t.crew_id));
          return { ...t, result: { status, reasons, changes } };
        });
      return {
        source: standFile.source,
        note: standFile.note,
        protocol: standFile.protocol,
        engine_version: STAND_TEST_ENGINE_VERSION,
        criteria: CRITERIA,
        personal_margin: PERSONAL_MARGIN,
        crew: crewRoster,
        count: tests.length,
        tests,
        fromDevice: true,
      };
    },
  );
}

/**
 * Station environment (NASA RR-1, ISS 2014): radiation per day and cabin air per day.
 * Bundled with the app (built by ml/environment.py), so it works with no network.
 * @returns {Promise<{ source, note, method, evaluation, radiation: { days }, cabin: { days, hourly_co2_mmhg } }>}
 */
export async function getEnvironment() {
  return environmentFile;
}

/**
 * @typedef {object} Indicator
 * @property {string} id
 * @property {string} name
 * @property {number|string} value
 * @property {string} unit
 * @property {'normal'|'watch'|'alert'} status
 * @property {'up'|'down'|'flat'} trend
 * @property {string} trendText
 * @property {number[]} [history] last 7 daily values, oldest first
 */
