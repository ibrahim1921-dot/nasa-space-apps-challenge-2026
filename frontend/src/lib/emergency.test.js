// Emergency mode: record and events, environment mapping, local storage, the band text and the
// flight-surgeon summary. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMERGENCY_KEY,
  ENVIRONMENT_BY_PROFILE,
  UNKNOWN_REPORTER,
  addEvent,
  applyServerCopy,
  bandText,
  bandVisible,
  canAct,
  cmoIsPatient,
  emergenciesAbout,
  endEmergency,
  environmentFor,
  forServer,
  latestReadingsFrom,
  mergeAll,
  newEmergency,
  openEmergencies,
  readEmergencies,
  setEnvironment,
  sinceStart,
  summaryText,
  switchToCollapse,
  toSend,
  upsertLocal,
  writeEmergencies,
} from './emergency.js';
import { MISSION_PROFILES, getProfile } from '../constants/mission.js';
import { EMERGENCY_SOURCES } from '../content/limits.js';
import { CHEST_PAIN_STEPS, COLLAPSE_STEPS, CPR_STEPS, POSITIONS } from '../content/emergency.js';
import { buildTimeline } from './vitalsCheckin.js';
import { crewDaysOf } from './testSupport.js';

const MAYA = { crew_id: 'crew-01', name: 'Maya Okafor' };
const T0 = '2026-11-14T14:02:00.000Z';
const at = (s) => new Date(Date.parse(T0) + s * 1000).toISOString();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

/** The fixed emergency used by the summary test: Maya reports Tomas, chest pain, then collapse and CPR. */
function fixedEmergency() {
  let em = newEmergency({ id: uuid(1), eventId: uuid(100), patientCrewId: 'crew-02', reporter: MAYA, flow: 'chest_pain', environment: 'station', drill: true, at: T0 });
  em = addEvent(em, { id: uuid(101), at: at(20), type: 'alert_sent', by: 'crew-01' });
  em = switchToCollapse(em, { id: uuid(102), at: at(95), by: 'crew-01' });
  em = addEvent(em, { id: uuid(103), at: at(110), type: 'compressions_started', by: 'crew-01' });
  em = addEvent(em, { id: uuid(104), at: at(230), type: 'swap', by: 'crew-01' });
  em = addEvent(em, { id: uuid(105), at: at(250), type: 'aed_arrived', by: 'crew-03' });
  em = addEvent(em, { id: uuid(106), at: at(300), type: 'aed_shock', by: 'crew-01' });
  em = addEvent(em, { id: uuid(107), at: at(420), type: 'breathing_normally', by: 'crew-01' });
  em = addEvent(em, { id: uuid(108), at: at(425), type: 'stopped', by: 'crew-01' });
  return endEmergency(em, { at: at(600), by: 'crew-03', note: 'Resting, held in place, CMO with him.', noteId: uuid(109) });
}

test('environment comes from the mission profile: station → station, transit → spacecraft, Moon surface → moon', () => {
  assert.equal(environmentFor('iss'), 'station');
  assert.equal(environmentFor('mars'), 'spacecraft');
  assert.equal(environmentFor('moon'), 'moon');
  assert.equal(environmentFor('unknown'), 'station', 'default profile is the ISS');
  for (const p of MISSION_PROFILES) assert.ok(ENVIRONMENT_BY_PROFILE[p.id], `profile ${p.id} has an environment`);
});

test('a new emergency starts with a `started` event; a signed-out reporter is "Unknown crew"', () => {
  const em = newEmergency({ id: uuid(1), eventId: uuid(2), patientCrewId: 'crew-02', reporter: MAYA, flow: 'collapse', environment: 'moon', at: T0 });
  assert.equal(em.started_at, T0);
  assert.equal(em.ended_at, null);
  assert.equal(em.drill, true, 'drill is on by default in this demo');
  assert.deepEqual(em.events, [{ id: uuid(2), at: T0, type: 'started', by: 'crew-01', detail: 'Collapsed / not responding' }]);
  const anon = newEmergency({ id: uuid(3), eventId: uuid(4), flow: 'chest_pain', environment: 'station', at: T0 });
  assert.deepEqual(anon.reporter, { crew_id: null, name: UNKNOWN_REPORTER });
  assert.equal(anon.patient_crew_id, null);
});

test('events: sorted by time, unknown types and repeated ids ignored, nothing but notes after the end', () => {
  let em = newEmergency({ id: uuid(1), eventId: uuid(2), reporter: MAYA, flow: 'chest_pain', environment: 'station', at: T0 });
  em = addEvent(em, { id: uuid(3), at: at(60), type: 'alert_sent', by: 'crew-01' });
  em = addEvent(em, { id: uuid(4), at: at(30), type: 'note', by: 'crew-01', detail: 'Pale' });
  assert.deepEqual(em.events.map((e) => e.type), ['started', 'note', 'alert_sent']);
  assert.equal(addEvent(em, { id: uuid(5), type: 'teleport' }), em);
  assert.equal(addEvent(em, { id: uuid(3), at: at(90), type: 'swap' }), em);
  const ended = endEmergency(em, { at: at(120), by: 'crew-01' });
  assert.equal(ended.ended_at, at(120));
  assert.equal(addEvent(ended, { id: uuid(6), at: at(130), type: 'swap' }), ended);
  assert.equal(addEvent(ended, { id: uuid(7), at: at(130), type: 'note', detail: 'later' }).events.length, 4);
  assert.equal(endEmergency(ended, { at: at(500) }).ended_at, at(120), 'the first end stays');
});

test('"They collapsed" switches the flow once and logs switched_to_collapse', () => {
  let em = newEmergency({ id: uuid(1), eventId: uuid(2), reporter: MAYA, flow: 'chest_pain', environment: 'station', at: T0 });
  em = switchToCollapse(em, { id: uuid(3), at: at(40), by: 'crew-01' });
  assert.equal(em.flow, 'collapse');
  assert.equal(switchToCollapse(em, { id: uuid(4), at: at(50) }), em);
  assert.equal(em.events.filter((e) => e.type === 'switched_to_collapse').length, 1);
  assert.equal(setEnvironment(em, 'moon').environment, 'moon');
  assert.equal(setEnvironment(em, 'mars'), em, 'unknown environment ignored');
});

test('storage: saved under ahm.emergency.v1, read back clean, corrupt storage reads as empty', () => {
  const s = memoryStorage();
  const em = fixedEmergency();
  assert.equal(writeEmergencies(s, upsertLocal([], em)), true);
  assert.ok(s.map.has(EMERGENCY_KEY));
  const [back] = readEmergencies(s);
  assert.deepEqual(back, em);
  s.setItem(EMERGENCY_KEY, '{not json');
  assert.deepEqual(readEmergencies(s), []);
  assert.deepEqual(readEmergencies(null), []);
  const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(readEmergencies(throwing), []);
  assert.equal(writeEmergencies(throwing, [em]), false);
});

test('storage keeps the newest 20, but never drops an open or unsent emergency', () => {
  const s = memoryStorage();
  const list = Array.from({ length: 25 }, (_, i) => {
    const e = newEmergency({ id: uuid(i + 1), eventId: uuid(i + 100), reporter: MAYA, flow: 'collapse', environment: 'station', at: at(i * 60) });
    return i === 0 ? e : { ...endEmergency(e, { at: at(i * 60 + 30) }), synced: true };
  });
  writeEmergencies(s, list);
  const back = readEmergencies(s);
  assert.equal(back.length, 21);
  assert.ok(back.some((e) => e.id === uuid(1)), 'the oldest is still open, so it stays');
});

test('what gets sent: unsynced, signed-in reporter; the CMO also sends records the server already has', () => {
  const mine = newEmergency({ id: uuid(1), eventId: uuid(2), reporter: MAYA, flow: 'collapse', environment: 'station', at: T0 });
  const anon = newEmergency({ id: uuid(3), eventId: uuid(4), flow: 'collapse', environment: 'station', at: T0 });
  const onServer = { ...mine, id: uuid(5), on_server: true };
  const list = [mine, anon, onServer];
  assert.deepEqual(toSend(list, { crewId: 'crew-01' }).map((e) => e.id), [uuid(1), uuid(5)]);
  assert.deepEqual(toSend(list, { crewId: 'crew-03', isCmo: true }).map((e) => e.id), [uuid(5)], 'never a device-only or not-yet-stored record of someone else');
  assert.deepEqual(toSend(list, { crewId: null }), []);
  assert.equal('synced' in forServer(mine) || 'on_server' in forServer(mine), false);
});

test('server copy merge: synced only when the server has every local event', () => {
  const local = addEvent(newEmergency({ id: uuid(1), eventId: uuid(2), reporter: MAYA, flow: 'collapse', environment: 'station', at: T0 }), { id: uuid(3), at: at(10), type: 'alert_sent', by: 'crew-01' });
  const serverHasAll = { ...local, synced: true, on_server: true };
  assert.equal(applyServerCopy([local], serverHasAll)[0].synced, true);
  const newer = addEvent(local, { id: uuid(4), at: at(20), type: 'compressions_started', by: 'crew-01' });
  const merged = applyServerCopy([newer], { ...local, synced: true, on_server: true })[0];
  assert.equal(merged.synced, false, 'an event added while sending is sent again');
  assert.equal(merged.events.length, 3);
  // The CMO's event on the server and the reporter's local one both stay.
  const cmoEvent = { id: uuid(9), at: at(15), type: 'note', by: 'crew-03', detail: 'On my way' };
  const all = mergeAll([{ ...local, events: [...local.events, cmoEvent], on_server: true, synced: true }], [newer]);
  assert.deepEqual(all[0].events.map((e) => e.id), [uuid(2), uuid(3), uuid(9), uuid(4)]);
});

test('who sees the band and who may act', () => {
  const em = fixedEmergency();
  const open = { ...em, ended_at: null };
  assert.equal(bandVisible(em, { crewId: 'crew-03', isCmo: true }), false, 'ended: no band');
  assert.equal(bandVisible(open, { crewId: 'crew-03', isCmo: true }), true);
  assert.equal(bandVisible(open, { crewId: 'crew-04' }), false, 'Kwame is neither patient nor reporter');
  assert.equal(bandVisible(open, { crewId: 'crew-02' }), true, 'the patient');
  assert.equal(bandVisible(open, {}), true, 'signed out on the same device');
  const cmoPatient = { ...open, patient_crew_id: 'crew-03' };
  assert.equal(cmoIsPatient(cmoPatient), true);
  assert.equal(bandVisible(cmoPatient, { crewId: 'crew-04' }), true, 'CMO is the patient: everyone');
  assert.equal(canAct(open, { crewId: 'crew-01' }), true);
  assert.equal(canAct(open, { crewId: 'crew-03', isCmo: true }), true);
  assert.equal(canAct(open, { crewId: 'crew-04' }), false);
  assert.equal(canAct({ ...open, reporter: { crew_id: null, name: UNKNOWN_REPORTER } }, { crewId: 'crew-04' }), true, 'device-only record');
  assert.deepEqual(openEmergencies([em, open]).map((e) => e.ended_at), [null]);
  assert.equal(emergenciesAbout([em, cmoPatient], 'crew-02').length, 1);
});

test('band text: "Emergency (DRILL) · Tomas · collapsed · started 3 min ago by Maya"', () => {
  const em = switchToCollapse(newEmergency({ id: uuid(1), eventId: uuid(2), patientCrewId: 'crew-02', reporter: MAYA, flow: 'chest_pain', environment: 'station', at: T0 }), { id: uuid(3), at: at(30) });
  assert.equal(bandText(em, Date.parse(at(200))), 'Emergency (DRILL) · Tomas · collapsed · started 3 min ago by Maya');
  assert.equal(bandText({ ...em, drill: false, patient_crew_id: null }, Date.parse(at(10))), 'Emergency · someone else · collapsed · started just now by Maya');
});

test('sinceStart is min:s from the start', () => {
  assert.equal(sinceStart(T0, T0), '+00:00');
  assert.equal(sinceStart(T0, at(95)), '+01:35');
  assert.equal(sinceStart(T0, at(3725)), '+62:05');
});

test('latest readings come from buildTimeline on or before the demo today, with provenance', () => {
  const crewDays = crewDaysOf('crew-02');
  const last = crewDays.at(-1);
  const exam = { recorded_at: `${last.date}T15:00:00.000Z`, kind_detail: 'cmo_exam', entered_by: { crew_id: 'crew-03', name: 'Lena Kowalski', role: 'cmo' }, systolic: 150, diastolic: 95, heart_rate: 104, glucose: null, temperature: null, sleep_hours: null, mood: null };
  const timeline = buildTimeline({ crewDays, saved: [exam] });
  const r = latestReadingsFrom(timeline, { today: last.date, seededCount: crewDays.length });
  assert.equal(r.date, last.date);
  const bp = r.items.find((i) => i.label === 'Blood pressure');
  assert.equal(bp.value, '150/95');
  assert.match(bp.provenance, /^CMO exam by Lena/);
  assert.equal(r.items.find((i) => i.label === 'Body temperature').provenance, 'synthetic crew record');
  assert.deepEqual(latestReadingsFrom(timeline, { today: '2000-01-01', seededCount: crewDays.length }), { date: null, items: [] });
});

test('summaryText for a fixed emergency: DRILL first, who/where/when, every event with min:s and who, readings with provenance', () => {
  const em = fixedEmergency();
  const readings = {
    date: '2026-11-03',
    items: [
      { label: 'Blood pressure', value: '150/95', unit: 'mmHg', provenance: 'CMO exam by Lena, 2026-11-03 15:00 UTC' },
      { label: 'Resting heart rate', value: '104', unit: 'bpm', provenance: 'simulated sensor' },
    ],
  };
  const text = summaryText(em, readings, getProfile('iss').delayText);
  assert.equal(
    text,
    [
      '*** DRILL: practice only, not a real emergency ***',
      'EMERGENCY HANDOFF SUMMARY',
      'Patient: Tomas Reyes (crew-02)',
      'Reported by: Maya Okafor (crew-01)',
      'Where: Space station',
      'Started: 2026-11-14 14:02:00 UTC',
      'Ended: 2026-11-14 14:12:00 UTC (+10:00 after start)',
      'Flow: Chest pain, awake, then Collapsed / not responding',
      'Signal delay to Earth: about 0 s (near real time)',
      '',
      'Events (min:s from start):',
      '+00:00  Emergency started: Chest pain, awake · Maya',
      '+00:20  Alert sent · Maya',
      '+01:35  They collapsed · Maya',
      '+01:50  Compressions started · Maya',
      '+03:50  Compressor swapped · Maya',
      '+04:10  AED arrived · Lena',
      '+05:00  Shock given · Maya',
      '+07:00  Breathing normally · Maya',
      '+07:05  Compressions stopped · Maya',
      '+10:00  Note: Resting, held in place, CMO with him. · Lena',
      '',
      'Latest readings for Tomas (demo day 2026-11-03):',
      '- Blood pressure: 150/95 mmHg (CMO exam by Lena, 2026-11-03 15:00 UTC)',
      '- Resting heart rate: 104 bpm (simulated sensor)',
      '',
      'Event times use the real clock; readings use the demo timeline. Crew data is synthetic. Not a diagnosis.',
    ].join('\n'),
  );
  const real = summaryText({ ...em, drill: false, patient_crew_id: 'crew-03' }, null, null);
  assert.equal(real.startsWith('EMERGENCY HANDOFF SUMMARY\nThe CMO is the patient. Contact the flight surgeon now.'), true);
  assert.match(real, /Latest readings for Lena: none on this device\./);
  assert.match(summaryText({ ...em, patient_crew_id: null }, null, null), /Patient: someone else \/ not sure/);
});

test('every guide step names a known source; AHA/ERC and the 2020 microgravity guideline are cited with links', () => {
  const all = [...CHEST_PAIN_STEPS, ...COLLAPSE_STEPS, ...CPR_STEPS, ...Object.values(POSITIONS).flat()];
  for (const s of all) assert.ok(EMERGENCY_SOURCES[s.source], `${s.id} has source ${s.source}`);
  assert.equal(EMERGENCY_SOURCES.cpr_micro_2020.source_url, 'https://doi.org/10.1186/s13049-020-00793-y');
  assert.deepEqual(EMERGENCY_SOURCES.aha_erc.source_urls.map((u) => u.url), ['https://cpr.heart.org/en/resuscitation-science/cpr-and-ecc-guidelines', 'https://cprguidelines.eu']);
  assert.equal(EMERGENCY_SOURCES.team.source_short, 'Team-set');
  assert.equal(POSITIONS.moon[0].source, 'team');
  assert.match(POSITIONS.moon[0].note, /does not cover partial gravity/);
});
