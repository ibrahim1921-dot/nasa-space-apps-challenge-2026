// Reminders: schedule rules, done detection, demo date vs real clock, escalation, snooze / Not today,
// quiet hours, gravity-only stand test, CMO-only kinds, the grip log and the ground inbox. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REMINDER_KINDS, REMINDER_SCHEDULE, REMINDER_SETTINGS, settingsLine } from '../content/reminderSchedule.js';
import { getProfile } from '../constants/mission.js';
import { crewDaysOf } from './testSupport.js';
import {
  bellCount,
  crewMissedMarkers,
  dueTodayTop,
  escalationLevel,
  groundEscalations,
  inQuietHours,
  missedItemsFor,
  missionDayOn,
  notificationsToSend,
  orderWithMissed,
  remindersFor,
} from './reminders.js';
import {
  EMPTY_REMINDER_STATE,
  REMINDERS_KEY,
  entryKey,
  markNotified,
  noteArrival,
  notToday,
  readReminderState,
  snooze,
  writeReminderState,
} from './reminderStore.js';
import { GRIP_LOG_KEY, makeGripEntry, parseKg, readGripLog, validateGrip, writeGripEntry } from './gripLog.js';
import { makeRecord } from './standTestStore.js';
import { stampOnDemoDate } from './demoState.js';
import { cannotMarkRead, inboxFor, markRead } from './groundInbox.js';
import { GROUND_MESSAGES_KEY, newMessage, readMessages } from '../ground/lib/messages.js';
import { memoryStorage } from '../ground/lib/testFixtures.js';

const MAYA = 'crew-01';
const LENA = 'crew-03';
const DAYS = crewDaysOf(MAYA); // last crew.json day: 2026-10-30, mission day 142
const ISS = getProfile('iss');
const MOON = getProfile('moon');
const at = (date, hm = '08:00') => new Date(`${date}T${hm}:00.000Z`);

let n = 0;
/** A saved check-in with per-reading statuses. */
function checkin(date, { reading = {}, watch = [], hm = '07:30', exam = false, crewId = MAYA } = {}) {
  n += 1;
  const full = { systolic: 118, diastolic: 76, heart_rate: 60, glucose: 90, temperature: 36.7, sleep_hours: 7, mood: 4, ...reading };
  const indicators = Object.fromEntries(['blood_pressure', 'heart_rate', 'glucose', 'temperature', 'sleep_hours', 'mood'].map((k) => [k, { status: watch.includes(k) ? 'watch' : 'normal' }]));
  return {
    id: `c${n}`,
    crew_id: crewId,
    kind: 'daily_vitals',
    recorded_at: `${date}T${hm}:00.000Z`,
    payload: { reading: full, context: {}, result: { status: watch.length ? 'watch' : 'normal', indicators }, ...(exam ? { kind_detail: 'cmo_exam' } : {}) },
  };
}

const base = (over = {}) => ({
  crewId: MAYA,
  role: 'crew',
  records: { checkins: [], standTests: [], grip: [], crewDays: DAYS, fitnessWeeks: [{ week: 20, missionDay: 140, grip_force: 29.4 }], ...(over.records ?? {}) },
  timeline: over.timeline ?? [],
  profile: over.profile ?? ISS,
  demoDate: over.demoDate ?? '2026-10-31',
  now: over.now ?? at(over.demoDate ?? '2026-10-31'),
  dismissed: over.dismissed ?? {},
  ...(over.role ? { role: over.role } : {}),
  ...(over.crewId ? { crewId: over.crewId } : {}),
});
const kinds = (items) => items.map((i) => i.kind);
const ofKind = (items, kind) => items.filter((i) => i.kind === kind);

// ---------- Schedule ----------

test('every schedule value is team-set and shown as Team-set', () => {
  assert.equal(REMINDER_SETTINGS.source, 'team');
  assert.deepEqual(REMINDER_KINDS.map((k) => k.id), ['daily_checkin', 'repeat_watch', 'device_gap', 'grip_weekly', 'stand_test', 'cmo_exam_followup', 'ground_message']);
  for (const k of REMINDER_KINDS) assert.equal(k.source, 'team', k.id);
  assert.equal(REMINDER_SETTINGS.dueHour, 10);
  assert.equal(REMINDER_SETTINGS.quietStartHour, 22);
  assert.equal(REMINDER_SETTINGS.quietEndHour, 6);
  assert.deepEqual([REMINDER_SETTINGS.overdueAfterDays, REMINDER_SETTINGS.cmoAfterDays, REMINDER_SETTINGS.groundAfterDays], [1, 2, 3]);
  assert.match(settingsLine(), /^Due by 10:00 crew time · snooze 1 h · no notifications 22:00–06:00 · CMO sees 2 missed days, ground 3$/);
});

// ---------- daily_checkin ----------

test('a new demo day shows the morning check-in; a check-in for that date clears it', () => {
  const before = remindersFor(base());
  assert.deepEqual(kinds(before), ['daily_checkin']);
  assert.equal(before[0].title, 'Morning check-in');
  assert.equal(before[0].action.label, 'Start check-in');
  assert.equal(before[0].dueAt, '2026-10-31T10:00:00.000Z');
  assert.deepEqual(remindersFor(base({ records: { checkins: [checkin('2026-10-31')] } })), []);
});

test('a sensor-confirmed check-in counts; a CMO exam does not', () => {
  const sensorConfirm = checkin('2026-10-31');
  sensorConfirm.payload.provenance = { systolic: 'sensor', diastolic: 'sensor', heart_rate: 'sensor' };
  assert.equal(ofKind(remindersFor(base({ records: { checkins: [sensorConfirm] } })), 'daily_checkin').length, 0);
  assert.equal(ofKind(remindersFor(base({ records: { checkins: [checkin('2026-10-31', { exam: true })] } })), 'daily_checkin').length, 1);
});

test('the demo date decides the day, the real clock the time of day', () => {
  // The same demo date: due before 10:00 crew time, overdue after it.
  assert.equal(remindersFor(base({ now: at('2026-11-15', '09:59') }))[0].status, 'due');
  assert.equal(remindersFor(base({ now: at('2026-11-15', '10:00') }))[0].status, 'overdue');
  // The real date is ignored: only demoDate picks the day (and its check-in).
  const items = remindersFor(base({ demoDate: '2026-10-31', now: at('2026-11-20', '08:00'), records: { checkins: [checkin('2026-10-31')] } }));
  assert.deepEqual(items, []);
});

test('records dated after the demo’s today are ignored', () => {
  const future = checkin('2026-11-02');
  const items = remindersFor(base({ demoDate: '2026-10-31', records: { checkins: [future] } }));
  assert.deepEqual(kinds(items), ['daily_checkin']);
});

// ---------- Escalation ----------

test('missed check-ins escalate at 1, 2 and 3 days in a row', () => {
  const day = (demoDate) => base({ demoDate, now: at(demoDate) });
  // Day 0 (31 Oct): nothing missed yet (30 Oct is the crew record).
  assert.equal(remindersFor(day('2026-10-31'))[0].missedDays, 0);
  assert.equal(remindersFor(day('2026-10-31'))[0].status, 'due');
  // 1 missed day: overdue for Maya, nobody else told.
  const d1 = remindersFor(day('2026-11-01'))[0];
  assert.deepEqual([d1.status, d1.missedDays], ['overdue', 1]);
  assert.equal(escalationLevel(1), 'overdue');
  assert.deepEqual(missedItemsFor(day('2026-11-01')), []);
  // 2 missed days: on the CMO's Crew overview card.
  const d2 = missedItemsFor(day('2026-11-02'));
  assert.deepEqual(d2.map((m) => [m.kind, m.level, m.text]), [['daily_checkin', 'cmo', 'Missed check-in · 2 days']]);
  assert.equal(crewMissedMarkers(d2).get(MAYA).text, 'Missed check-in · 2 days');
  assert.deepEqual(groundEscalations(d2), []);
  // 3 missed days: also listed for the ground.
  const d3 = missedItemsFor(day('2026-11-03'));
  assert.deepEqual(d3.map((m) => [m.level, m.text]), [['ground', 'Missed check-in · 3 days']]);
  assert.equal(groundEscalations(d3).length, 1);
});

test('a check-in in between restarts the count', () => {
  const items = remindersFor(base({ demoDate: '2026-11-03', now: at('2026-11-03'), records: { checkins: [checkin('2026-11-01')] } }));
  assert.equal(items[0].missedDays, 1); // only 2 Nov missed
  assert.deepEqual(missedItemsFor(base({ demoDate: '2026-11-03', records: { checkins: [checkin('2026-11-03')] } })), []);
});

// ---------- Snooze / Not today ----------

test('snooze 1 h: snoozed, not counted on the bell, back after the hour', () => {
  const now = at('2026-10-31', '08:00');
  const item = remindersFor(base({ now }))[0];
  const state = snooze(EMPTY_REMINDER_STATE, { crewId: MAYA, reminderId: item.id, demoDate: '2026-10-31', now });
  const snoozed = remindersFor(base({ now, dismissed: state.entries }));
  assert.equal(snoozed[0].status, 'snoozed');
  assert.equal(bellCount(snoozed), 0);
  assert.deepEqual(dueTodayTop(snoozed), []);
  const later = remindersFor(base({ now: new Date(now.getTime() + 61 * 60_000), dismissed: state.entries }));
  assert.equal(later[0].status, 'due');
  assert.equal(bellCount(later), 1);
});

test('Not today hides it for this demo date only, and never from the CMO or ground count', () => {
  const demoDate = '2026-11-03';
  const id = remindersFor(base({ demoDate }))[0].id;
  const state = notToday(EMPTY_REMINDER_STATE, { crewId: MAYA, reminderId: id, demoDate, reason: '  EVA prep all morning  ' });
  assert.equal(state.entries[entryKey(MAYA, id, demoDate)].reason, 'EVA prep all morning');
  assert.deepEqual(remindersFor(base({ demoDate, dismissed: state.entries })), []);
  assert.equal(missedItemsFor(base({ demoDate, dismissed: state.entries }))[0].missedDays, 3);
  // The next demo day it is back.
  assert.equal(ofKind(remindersFor(base({ demoDate: '2026-11-04', dismissed: state.entries })), 'daily_checkin').length, 1);
});

test('snooze and Not today survive a reload (ahm.reminders.v1)', () => {
  const storage = memoryStorage();
  let s = snooze(readReminderState(storage), { crewId: MAYA, reminderId: 'daily_checkin:2026-10-31', demoDate: '2026-10-31', now: at('2026-10-31') });
  s = notToday(s, { crewId: MAYA, reminderId: 'grip_weekly:21', demoDate: '2026-10-31', reason: 'x'.repeat(200) });
  s = noteArrival(noteArrival(s, 'moon', '2026-11-01'), 'moon', '2026-11-09');
  s = markNotified(s, { crewId: MAYA, reminderId: 'daily_checkin:2026-10-31', demoDate: '2026-10-31', now: at('2026-10-31') });
  assert.ok(writeReminderState(storage, s));
  const back = readReminderState(storage);
  assert.equal(back.entries[`${MAYA}|daily_checkin:2026-10-31|2026-10-31`].snoozedUntil, '2026-10-31T09:00:00.000Z');
  assert.equal(back.entries[`${MAYA}|grip_weekly:21|2026-10-31`].reason.length, 60);
  assert.equal(back.arrival.moon, '2026-11-01');
  assert.ok(back.notified[`${MAYA}|daily_checkin:2026-10-31|2026-10-31`]);
  assert.deepEqual(readReminderState(memoryStorage({ [REMINDERS_KEY]: '{bad' })), { entries: {}, notified: {}, arrival: {}, notify: false });
});

// ---------- Quiet hours and notifications ----------

test('quiet hours are 22:00–06:00 crew time', () => {
  assert.equal(inQuietHours(at('2026-11-15', '21:59')), false);
  assert.equal(inQuietHours(at('2026-11-15', '22:00')), true);
  assert.equal(inQuietHours(at('2026-11-15', '03:00')), true);
  assert.equal(inQuietHours(at('2026-11-15', '05:59')), true);
  assert.equal(inQuietHours(at('2026-11-15', '06:00')), false);
});

test('notifications: never in quiet hours, only when allowed, at most once per reminder per day', () => {
  const items = remindersFor(base());
  const args = { items, crewId: MAYA, demoDate: '2026-10-31', enabled: true, permission: 'granted' };
  assert.equal(notificationsToSend({ ...args, now: at('2026-11-15', '23:00') }).length, 0); // quiet: still in the app
  assert.equal(remindersFor(base({ now: at('2026-10-31', '23:00') })).length, 1);
  assert.equal(notificationsToSend({ ...args, now: at('2026-11-15', '08:00'), permission: 'denied' }).length, 0);
  assert.equal(notificationsToSend({ ...args, now: at('2026-11-15', '08:00'), enabled: false }).length, 0);
  assert.equal(notificationsToSend({ ...args, now: at('2026-11-15', '08:00') }).length, 1);
  const s = markNotified(EMPTY_REMINDER_STATE, { crewId: MAYA, reminderId: items[0].id, demoDate: '2026-10-31' });
  assert.equal(notificationsToSend({ ...args, now: at('2026-11-15', '09:00'), notified: s.notified }).length, 0);
});

// ---------- repeat_watch ----------

test('a reading on watch is due again the next day, until a later check-in includes it', () => {
  const watchDay = checkin('2026-10-31', { watch: ['heart_rate'] });
  const next = remindersFor(base({ demoDate: '2026-11-01', records: { checkins: [watchDay] } }));
  const item = ofKind(next, 'repeat_watch')[0];
  assert.equal(item.title, 'Repeat a watch reading');
  assert.match(item.detail, /^Resting heart rate was on watch on 31 Oct/);
  assert.equal(item.dueAt, '2026-11-01T10:00:00.000Z');
  assert.equal(item.missedDays, 0);
  // A second check-in the same day does not count; one on a later date with the reading does.
  const sameDay = checkin('2026-10-31', { hm: '20:00' });
  assert.equal(ofKind(remindersFor(base({ demoDate: '2026-11-01', records: { checkins: [watchDay, sameDay] } })), 'repeat_watch').length, 1);
  const later = checkin('2026-11-01');
  assert.equal(ofKind(remindersFor(base({ demoDate: '2026-11-01', records: { checkins: [watchDay, later] } })), 'repeat_watch').length, 0);
  // A later check-in without that reading does not clear it.
  const noHr = checkin('2026-11-01', { reading: { heart_rate: null } });
  assert.equal(ofKind(remindersFor(base({ demoDate: '2026-11-02', records: { checkins: [watchDay, noHr] } })), 'repeat_watch')[0].missedDays, 1);
});

test('no repeat reminder on the watch day itself', () => {
  const items = remindersFor(base({ demoDate: '2026-10-31', records: { checkins: [checkin('2026-10-31', { watch: ['sleep_hours'] })] } }));
  assert.deepEqual(items, []);
});

// ---------- device_gap ----------

test('a device with no data today creates "Check a sensor"; a value entered by hand clears it', () => {
  const timeline = [{ date: '2026-10-31', devices: { shirt: 'not worn', cgm: 'ok', headband: 'ok', actigraph: 'ok' } }];
  const items = ofKind(remindersFor(base({ timeline })), 'device_gap');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Check a sensor');
  assert.match(items[0].detail, /bio-monitor shirt/);
  const byHand = checkin('2026-10-31', { reading: { glucose: null } }); // BP + heart rate typed in
  assert.equal(ofKind(remindersFor(base({ timeline, records: { checkins: [byHand] } })), 'device_gap').length, 0);
  const without = checkin('2026-10-31', { reading: { heart_rate: null } });
  assert.equal(ofKind(remindersFor(base({ timeline, records: { checkins: [without] } })), 'device_gap').length, 1);
  assert.equal(ofKind(remindersFor(base({ timeline: [{ date: '2026-10-31', devices: { shirt: 'ok' } }] })), 'device_gap').length, 0);
});

// ---------- grip_weekly ----------

test('grip strength is due once per mission week and clears with a logged value that week', () => {
  assert.equal(missionDayOn(DAYS, '2026-11-04'), 147);
  // Mission day 143: week 20 (day 140) already has a crew-record value.
  assert.equal(ofKind(remindersFor(base({ demoDate: '2026-10-31' })), 'grip_weekly').length, 0);
  // Mission day 147 (week 21): due.
  const due = ofKind(remindersFor(base({ demoDate: '2026-11-04' })), 'grip_weekly')[0];
  assert.deepEqual([due.id, due.missedDays, due.action.label], ['grip_weekly:21', 0, 'Open grip test']);
  assert.equal(ofKind(remindersFor(base({ demoDate: '2026-11-06' })), 'grip_weekly')[0].missedDays, 2);
  // A value logged in week 21 clears it for the rest of that week; week 22 is due again.
  const entry = makeGripEntry({ crewId: MAYA, kg: 30.5, recordedAt: '2026-11-05T08:00:00.000Z', id: 'g1' });
  assert.equal(ofKind(remindersFor(base({ demoDate: '2026-11-06', records: { grip: [entry] } })), 'grip_weekly').length, 0);
  assert.equal(ofKind(remindersFor(base({ demoDate: '2026-11-11', records: { grip: [entry] } })), 'grip_weekly')[0].id, 'grip_weekly:22');
  // A value dated after the demo's today does not count yet.
  assert.equal(ofKind(remindersFor(base({ demoDate: '2026-11-04', records: { grip: [entry] } })), 'grip_weekly').length, 1);
});

test('grip log accepts 5–90 kg in whole or half kg', () => {
  assert.equal(validateGrip(5), null);
  assert.equal(validateGrip(90), null);
  assert.equal(validateGrip(31.5), null);
  assert.match(validateGrip(4.5), /from 5 to 90 kg/);
  assert.match(validateGrip(90.5), /from 5 to 90 kg/);
  assert.match(validateGrip(31.2), /whole or half/);
  assert.match(validateGrip(''), /Enter/);
  assert.match(validateGrip(parseKg('abc')), /number/);
  assert.equal(parseKg('31,5'), 31.5);
  const storage = memoryStorage();
  assert.deepEqual(writeGripEntry(storage, makeGripEntry({ crewId: MAYA, kg: 120, recordedAt: '2026-11-05T08:00:00.000Z', id: 'bad' })).ok, false);
  assert.ok(writeGripEntry(storage, makeGripEntry({ crewId: MAYA, kg: 31, recordedAt: '2026-11-05T08:00:00.000Z', id: 'g1' })).ok);
  assert.deepEqual(readGripLog(storage, MAYA).map((e) => e.kg), [31]);
  assert.deepEqual(readGripLog(memoryStorage({ [GRIP_LOG_KEY]: '[{"kg":1}]' }), MAYA), []);
});

// ---------- stand_test ----------

test('no stand test reminder in weightlessness (station, spacecraft)', () => {
  for (const id of ['iss', 'lunar_transit', 'mars']) {
    assert.equal(ofKind(remindersFor(base({ profile: getProfile(id) })), 'stand_test').length, 0, id);
  }
});

test('Moon base: stand test due on arrival day, then weekly', () => {
  const arrival = { arrivalDate: '2026-10-31' };
  const first = ofKind(remindersFor(base({ profile: MOON, records: arrival })), 'stand_test')[0];
  assert.deepEqual([first.id, first.missedDays], ['stand_test:2026-10-31', 0]);
  assert.match(first.detail, /0\.17 g/);
  assert.equal(ofKind(remindersFor(base({ profile: MOON, demoDate: '2026-11-07', records: arrival })), 'stand_test')[0].id, 'stand_test:2026-11-07');
  // No arrival date stored yet: arrival is today.
  assert.equal(ofKind(remindersFor(base({ profile: getProfile('mars_surface') })), 'stand_test')[0].id, 'stand_test:2026-10-31');
});

test('a demo-dated stand test clears the reminder; a real-dated one in the demo’s future does not', () => {
  const rec = (recordedAt) => {
    const r = makeRecord({ crewId: MAYA, test: {}, status: 'normal', reasons: [], engineVersion: 'test', recordedAt });
    return r;
  };
  const demoDated = rec(stampOnDemoDate('2026-11-02', at('2026-11-15', '09:12')));
  assert.equal(demoDated.recorded_at, '2026-11-02T09:12:00.000Z');
  const args = (standTests) => base({ profile: MOON, demoDate: '2026-11-02', records: { arrivalDate: '2026-10-31', standTests } });
  assert.equal(ofKind(remindersFor(args([demoDated])), 'stand_test').length, 0);
  assert.equal(ofKind(remindersFor(args([rec('2026-11-15T09:12:00.000Z')])), 'stand_test').length, 1);
});

test('old stand test records keep loading: without recordedAt the real time is used, as before', () => {
  const before = Date.now();
  const r = makeRecord({ crewId: MAYA, test: {}, status: 'normal', reasons: [], engineVersion: 'test' });
  assert.ok(Date.parse(r.recorded_at) >= before - 1000);
  assert.deepEqual(Object.keys(r), ['id', 'crew_id', 'kind', 'recorded_at', 'payload', 'status', 'reasons', 'engine_version', 'synced_at', 'scored_on']);
});

// ---------- CMO-only ----------

const AT_MSG = '2026-11-14T10:00:00.000Z';
const draft = { to: 'cmo', subject: 'Check-in', body: 'Please repeat the check-in tomorrow morning.', priority: 'routine', related: { kind: null, id: null } };
const crewList = [
  { id: 'crew-02', name: 'Tomas Reyes', status: 'alert', exams: [] },
  { id: 'crew-04', name: 'Kwame Asante', status: 'normal', exams: [] },
];

test('CMO-only reminders never reach crew', () => {
  const messages = [newMessage(draft, { profile: ISS, at: AT_MSG, id: 'm1' })];
  const crew = remindersFor(base({ records: { crew: crewList, messages } }));
  assert.deepEqual(kinds(crew), ['daily_checkin']);
  const cmo = remindersFor(base({ crewId: LENA, role: 'cmo', now: new Date('2026-11-14T10:05:00.000Z'), records: { crewDays: crewDaysOf(LENA), crew: crewList, messages } }));
  assert.deepEqual(kinds(cmo).sort(), ['cmo_exam_followup', 'daily_checkin', 'ground_message']);
  const exam = ofKind(cmo, 'cmo_exam_followup')[0];
  assert.deepEqual([exam.title, exam.action.label, exam.action.crewId], ['Examine a crew member', 'Record an exam', 'crew-02']);
  assert.match(exam.detail, /Tomas Reyes is on alert/);
});

test('exam follow-up clears once an exam is recorded (today or within 24 h)', () => {
  const withExam = [{ ...crewList[0], exams: [checkin('2026-10-30', { exam: true, crewId: 'crew-02' })] }];
  const args = (demoDate) => base({ crewId: LENA, role: 'cmo', demoDate, records: { crewDays: crewDaysOf(LENA), crew: withExam } });
  assert.equal(ofKind(remindersFor(args('2026-10-31')), 'cmo_exam_followup').length, 0);
  assert.equal(ofKind(remindersFor(args('2026-11-01')), 'cmo_exam_followup').length, 1);
});

test('ground message: only delivered and unread; skipped when the messages cannot be read', () => {
  const mars = getProfile('mars');
  const m = newMessage(draft, { profile: mars, at: AT_MSG, id: 'm1' });
  const args = (messages, now) => base({ crewId: LENA, role: 'cmo', now: new Date(now), records: { crewDays: crewDaysOf(LENA), messages } });
  assert.equal(ofKind(remindersFor(args([m], '2026-11-14T10:05:00.000Z')), 'ground_message').length, 0); // in transit
  const delivered = ofKind(remindersFor(args([m], '2026-11-14T10:25:00.000Z')), 'ground_message');
  assert.deepEqual([delivered.length, delivered[0].action.messageId], [1, 'm1']);
  assert.equal(ofKind(remindersFor(args([{ ...m, read_at: '2026-11-14T10:30:00.000Z' }], '2026-11-14T10:40:00.000Z')), 'ground_message').length, 0);
  assert.equal(ofKind(remindersFor(args(null, '2026-11-14T10:40:00.000Z')), 'ground_message').length, 0);
});

// ---------- Crew overview order ----------

test('people with a missed marker sort before normal, after watch; the officer last', () => {
  const cards = [
    { id: 'crew-01', status: 'normal' },
    { id: 'crew-02', status: 'normal' },
    { id: 'crew-03', status: 'normal' },
    { id: 'crew-04', status: 'watch' },
  ];
  const markers = new Map([['crew-02', { text: 'Missed check-in · 2 days' }], ['crew-03', { text: 'x' }]]);
  assert.deepEqual(orderWithMissed(cards, 'crew-03', new Set(), markers).map((c) => c.id), ['crew-04', 'crew-02', 'crew-01', 'crew-03']);
  assert.deepEqual(orderWithMissed(cards, 'crew-03', new Set(['crew-01']), markers).map((c) => c.id), ['crew-01', 'crew-04', 'crew-02', 'crew-03']);
});

test('the bell and Due today come from one list: overdue first, at most 3 on Today', () => {
  const timeline = [{ date: '2026-11-04', devices: { shirt: 'not worn', cgm: 'not worn', headband: 'ok', actigraph: 'ok' } }];
  const items = remindersFor(base({ demoDate: '2026-11-04', now: at('2026-11-04', '08:00'), timeline, profile: MOON, records: { arrivalDate: '2026-10-31' } }));
  assert.equal(items[0].status, 'overdue');
  assert.ok(items.length > 3);
  assert.deepEqual(dueTodayTop(items), items.slice(0, 3));
  assert.equal(bellCount(items), items.length);
});

// ---------- Ground inbox ----------

const seedMessages = () => {
  const mars = getProfile('mars');
  return [
    newMessage(draft, { profile: mars, at: AT_MSG, id: 'to-cmo' }),
    newMessage({ ...draft, to: 'crew-02' }, { profile: mars, at: AT_MSG, id: 'to-tomas' }),
    newMessage(draft, { profile: mars, at: '2026-11-14T11:00:00.000Z', id: 'in-transit' }),
  ];
};
const DELIVERED = Date.parse('2026-11-14T10:30:00.000Z');

test('the inbox only sets read_at on a delivered message addressed to this person', () => {
  const storage = memoryStorage({ [GROUND_MESSAGES_KEY]: JSON.stringify(seedMessages()) });
  const before = storage.getItem(GROUND_MESSAGES_KEY);
  const cmo = { crewId: LENA, role: 'cmo', now: DELIVERED };
  assert.deepEqual(inboxFor(storage, cmo).map((m) => m.id), ['in-transit', 'to-cmo']);
  // Refused: someone else's, not arrived yet, unknown id. Storage is untouched each time.
  assert.match(markRead(storage, 'to-tomas', cmo).error, /someone else/);
  assert.match(markRead(storage, 'in-transit', cmo).error, /not arrived/);
  assert.match(markRead(storage, 'nope', cmo).error, /not found/);
  assert.equal(storage.getItem(GROUND_MESSAGES_KEY), before);
  // Crew cannot read the CMO's message, but can read their own.
  assert.match(markRead(storage, 'to-cmo', { crewId: 'crew-02', role: 'crew', now: DELIVERED }).error, /someone else/);
  assert.ok(markRead(storage, 'to-tomas', { crewId: 'crew-02', role: 'crew', now: DELIVERED }).ok);
  // Allowed: only read_at changes; nothing is created, edited or deleted.
  const res = markRead(storage, 'to-cmo', cmo);
  assert.equal(res.read_at, '2026-11-14T10:30:00.000Z');
  const after = JSON.parse(storage.getItem(GROUND_MESSAGES_KEY));
  const original = JSON.parse(before);
  assert.equal(after.length, original.length);
  after.forEach((m, i) => {
    const { read_at: a, ...rest } = m;
    const { read_at: b, ...restBefore } = original[i];
    assert.deepEqual(rest, restBefore);
    if (!['to-cmo', 'to-tomas'].includes(m.id)) assert.equal(a, b);
  });
  assert.equal(readMessages(storage).find((m) => m.id === 'to-cmo').read_at, '2026-11-14T10:30:00.000Z');
  assert.match(markRead(storage, 'to-cmo', cmo).error, /Already read/);
  assert.match(cannotMarkRead(null, cmo), /not found/);
});

test('the inbox keeps unreadable stored entries as they are', () => {
  const list = [{ id: 'junk' }, ...seedMessages()];
  const storage = memoryStorage({ [GROUND_MESSAGES_KEY]: JSON.stringify(list) });
  assert.ok(markRead(storage, 'to-cmo', { crewId: LENA, role: 'cmo', now: DELIVERED }).ok);
  assert.deepEqual(JSON.parse(storage.getItem(GROUND_MESSAGES_KEY))[0], { id: 'junk' });
  assert.equal(markRead(memoryStorage({ [GROUND_MESSAGES_KEY]: '{bad' }), 'to-cmo', { crewId: LENA, role: 'cmo', now: DELIVERED }).ok, false);
});

test('REMINDER_SCHEDULE bundles kinds and settings', () => {
  assert.equal(REMINDER_SCHEDULE.kinds, REMINDER_KINDS);
  assert.equal(REMINDER_SCHEDULE.settings, REMINDER_SETTINGS);
});
