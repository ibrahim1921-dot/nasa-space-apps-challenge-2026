// Single data-access layer. Every view gets its data through this file.
//
// Two modes (see lib/backend.js):
//   NEXT_PUBLIC_USE_MOCKS=true  (default) the app's own mock API in src/app/api, plus bundled data.
//   NEXT_PUBLIC_USE_MOCKS=false the team's Java backend for what docs/api-contract.md covers today
//                               (check-ins go through the outbox in hooks/useOnboard.jsx; radiation
//                               below). The rest stays on the mock API until the backend serves it in
//                               the same shape: crew details, region indicators, nights, labs, stand tests.
//
// Offline-first: where the data is bundled (crew, region indicators, seeded stand tests, radiation),
// a failed request falls back to the same data on this device, so the app keeps working with no network.

import { crewMemberFor, crewRoster } from '../mocks/crew.js';
import { regionIndicators, regionStatuses } from '../mocks/regions.js';
import { applyRangeStatus } from '../lib/rangeCheck.js';
import { CRITERIA, PERSONAL_MARGIN, STAND_TEST_ENGINE_VERSION, evaluateStandTest } from '../lib/standTest.js';
import { preflightTestsOf, standFile } from '../data/bundled.js';
import radiationFile from '../data/rr1_radiation.json';
import { USE_MOCKS, backend } from '../lib/backend.js';

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
 * The logged-in crew member (ids, names and roles come from data/crew.json).
 * @returns {Promise<{ id, name, role, missionDay, totalMissionDays, roster: {id, name, role}[], lastUpdated }>}
 */
export async function getCrewMember(crewId) {
  const query = crewId ? `?crew=${encodeURIComponent(crewId)}` : '';
  return withDeviceFallback(
    () => request(`/api/crew${query}`),
    () => {
      const member = crewMemberFor(crewId ?? 'crew-01');
      return member && { ...member, roster: crewRoster, lastUpdated: new Date().toISOString(), fromDevice: true };
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
 * ISS radiation dose per day (NASA RR-1). Backend: GET /api/environment/radiation.
 * @returns {Promise<{ source, note, unit, days: { date, gcr, saa, total, accumulated }[] }>}
 */
export async function getRadiation() {
  if (USE_MOCKS) return radiationFile;
  return withDeviceFallback(() => backend('/api/environment/radiation'), () => ({ ...radiationFile, fromDevice: true }));
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
