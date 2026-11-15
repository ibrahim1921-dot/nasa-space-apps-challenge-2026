// The daily Reaction Run reminder (APP_REMINDER_SCHEDULE), and that no game record changes any status
// or any other reminder. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_REMINDER_SCHEDULE, REMINDER_KINDS, REMINDER_SCHEDULE } from '../content/reminderSchedule.js';
import { REACTION_REMINDER_KIND } from '../content/activities.js';
import { getProfile } from '../constants/mission.js';
import { crewDaysOf, preflightOf } from './testSupport.js';
import { missedItemsFor, remindersFor } from './reminders.js';
import { buildPersonDashboard } from './personCards.js';
import { exerciseRow, journeyProgress, makeActivity, reactionPanel, scoreReactionRun, weekSessions } from './activities.js';
import { earnedFromRecords } from './patches.js';
import { regionIndicators } from '../mocks/regions.js';

const MAYA = 'crew-01';
const DAYS = crewDaysOf(MAYA);
const ISS = getProfile('iss');
const at = (date, hm) => new Date(`${date}T${hm}:00.000Z`);
let n = 0;
const act = (kind, date, data, crewId = MAYA, hm = '09:00') => {
  n += 1;
  return makeActivity({ id: `r${n}`, crewId, kind, recordedAt: `${date}T${hm}:00.000Z`, data });
};
const run = (date, crewId = MAYA) => act('reaction_run', date, { median_ms: 250, lapses: 0, false_starts: 0, trials: 20 }, crewId);

const args = (over = {}) => ({
  crewId: MAYA,
  role: 'crew',
  records: { checkins: [], standTests: [], grip: [], crewDays: DAYS, fitnessWeeks: [], activities: [], ...(over.records ?? {}) },
  timeline: [],
  profile: ISS,
  demoDate: '2026-10-31',
  now: at('2026-10-31', '08:00'),
  schedule: APP_REMINDER_SCHEDULE,
  ...over,
  ...(over.records ? { records: { checkins: [], standTests: [], grip: [], crewDays: DAYS, fitnessWeeks: [], activities: [], ...over.records } } : {}),
});
const reaction = (items) => items.filter((i) => i.kind === 'reaction_daily');

test('the app schedule adds reaction_daily after the unchanged kinds', () => {
  assert.deepEqual(APP_REMINDER_SCHEDULE.kinds.map((k) => k.id), [...REMINDER_KINDS.map((k) => k.id), 'reaction_daily']);
  assert.equal(APP_REMINDER_SCHEDULE.settings, REMINDER_SCHEDULE.settings);
  assert.equal(REMINDER_SCHEDULE.kinds.some((k) => k.id === 'reaction_daily'), false);
  assert.equal(REACTION_REMINDER_KIND.title, 'Reaction Run');
  assert.equal(REACTION_REMINDER_KIND.dueHour, 12);
  assert.equal(REACTION_REMINDER_KIND.source, 'team');
  assert.equal(REACTION_REMINDER_KIND.escalates, false);
});

test('Reaction Run is due each day until one is logged on that demo day', () => {
  const due = reaction(remindersFor(args()));
  assert.equal(due.length, 1);
  assert.equal(due[0].id, 'reaction_daily:2026-10-31');
  assert.equal(due[0].title, 'Reaction Run');
  assert.equal(due[0].status, 'due');
  assert.equal(due[0].dueAt, '2026-10-31T12:00:00.000Z');
  assert.deepEqual(due[0].action, { id: 'activity', game: 'reaction_run', label: 'Play Reaction Run' });
  assert.deepEqual(reaction(remindersFor(args({ records: { activities: [run('2026-10-31')] } }))), []);
});

test('a run on another day, by someone else, or after the demo date does not clear it', () => {
  for (const r of [run('2026-10-30'), run('2026-10-31', 'crew-02'), run('2026-11-01')]) {
    assert.equal(reaction(remindersFor(args({ records: { activities: [r] } }))).length, 1, r.recorded_at);
  }
  // A Calm Orbit does not clear it either
  const calm = act('calm_orbit', '2026-10-31', { minutes: 2, feeling: 'same' });
  assert.equal(reaction(remindersFor(args({ records: { activities: [calm] } }))).length, 1);
});

test('overdue after 12:00; the other rules still use 10:00', () => {
  const at11 = remindersFor(args({ now: at('2026-10-31', '11:00') }));
  assert.equal(reaction(at11)[0].status, 'due');
  assert.equal(at11.find((i) => i.kind === 'daily_checkin').status, 'overdue');
  const at12 = remindersFor(args({ now: at('2026-10-31', '12:00') }));
  assert.equal(reaction(at12)[0].status, 'overdue');
});

test('the default schedule gives exactly the same list as before (no Reaction Run)', () => {
  const { schedule: _s, ...rest } = args({ records: { activities: [] } });
  const before = remindersFor(rest);
  assert.equal(before.some((i) => i.kind === 'reaction_daily'), false);
  const app = remindersFor(args()).filter((i) => i.kind !== 'reaction_daily');
  assert.deepEqual(app, before);
});

test('Reaction Run never escalates to the CMO or the ground', () => {
  const missed = missedItemsFor({ ...args({ demoDate: '2026-11-10', now: at('2026-11-10', '18:00') }) });
  assert.equal(missed.some((m) => m.kind === 'reaction_daily'), false);
});

test('game records never change another reminder', () => {
  const activities = [run('2026-10-31'), act('crew_journey', '2026-10-31', { type: 'bike', minutes: 30 })];
  const without = remindersFor(args()).filter((i) => i.kind !== 'reaction_daily');
  const withGames = remindersFor(args({ records: { activities } })).filter((i) => i.kind !== 'reaction_daily');
  assert.deepEqual(withGames, without);
});

// ---------- No game record changes any status ----------

test('the dashboard, its cards and the overall status ignore game records', () => {
  const person = (extra) =>
    buildPersonDashboard({ crewId: MAYA, crewDays: DAYS, preflight: preflightOf(MAYA), saved: [], sensorDays: [], today: '2026-10-31', ...extra });
  const before = person({});
  // Activity records are not readings: even passed in among saved records, none is used
  const activities = [run('2026-10-31'), act('calm_orbit', '2026-10-31', { minutes: 2, feeling: 'worse' })];
  const after = person({ saved: activities });
  assert.deepEqual(after.statuses, before.statuses);
  assert.deepEqual(after.overall, before.overall);
  assert.deepEqual(after.cards, before.cards);
});

test('no game helper returns a status', () => {
  const activities = [run('2026-10-29'), run('2026-10-30'), run('2026-10-31'), act('crew_journey', '2026-10-31', { type: 'bike', minutes: 30 })];
  const hasStatus = (v) => JSON.stringify(v).includes('"status"');
  assert.equal(hasStatus(scoreReactionRun({ reactions: [600, 700, null] })), false);
  assert.equal(hasStatus(reactionPanel(activities, MAYA, '2026-10-31')), false);
  assert.equal(hasStatus(journeyProgress(activities, 'iss', '2026-10-31')), false);
  assert.equal(hasStatus(weekSessions(activities, MAYA, '2026-10-31')), false);
  assert.equal(hasStatus(earnedFromRecords({ crewId: MAYA, activities, crewDays: DAYS, profileId: 'iss', demoDate: '2026-10-31' })), false);
  // The drawer row keeps the exercise row's own status: game minutes never set it
  const mock = regionIndicators.limbs.find((i) => i.id === 'exercise-time');
  for (const minutes of [5, 120]) {
    const row = exerciseRow(mock, [act('crew_journey', '2026-10-31', { type: 'bike', minutes })], MAYA, '2026-10-31');
    assert.equal(row.status, mock.status);
  }
});
