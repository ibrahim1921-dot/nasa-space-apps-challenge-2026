// Reminders: what is due, when, and how "done" is read from records already saved.
// Every value here is the team's choice, not a clinical standard: `source: 'team'`, shown as "Team-set"
// wherever its number appears in the UI (panel footer, About → Team-set lines, the notifications switch).
// The engine is lib/reminders.js; nothing here changes a limit, a threshold or scoring.

import { REACTION_REMINDER_KIND } from './activities.js';

export const TEAM_SET = 'Team-set';

/** Team-set timing values. Crew time is UTC (the ISS runs on GMT). */
export const REMINDER_SETTINGS = Object.freeze({
  source: 'team',
  dueHour: 10, // daily items are due by 10:00 crew time
  quietStartHour: 22, // no browser notification from 22:00 …
  quietEndHour: 6, // … to 06:00 crew time (reminders still show in the app)
  overdueAfterDays: 1, // 1 missed day: the person's own reminder is "overdue"
  cmoAfterDays: 2, // 2 missed days in a row: shown on the CMO's Crew overview card
  groundAfterDays: 3, // 3 missed days in a row: also listed for the ground console
  snoozeMinutes: 60,
  missionWeekDays: 7, // grip strength and stand test are weekly
  examWindowHours: 24, // CMO: an exam within this window clears the follow-up
  lookbackDays: 14, // missed days are counted back at most this far
  reasonMaxLength: 60, // "Not today" reason
});

/**
 * The schedule. `action` is what the item's button does (App.jsx maps the id to a screen).
 * `cmoOnly` items never reach crew. `escalates` items count toward the CMO and ground lists.
 */
export const REMINDER_KINDS = Object.freeze([
  {
    id: 'daily_checkin',
    title: 'Morning check-in',
    when: 'Every day by 10:00 crew time',
    done: 'A check-in saved for that demo date (sensor confirm counts)',
    missedLabel: 'Missed check-in',
    action: { id: 'checkin', label: 'Start check-in' },
    cmoOnly: false,
    escalates: true,
    source: 'team',
  },
  {
    id: 'repeat_watch',
    title: 'Repeat a watch reading',
    when: 'The day after a reading was on watch',
    done: 'The next check-in on a later date includes that reading',
    missedLabel: 'Missed repeat reading',
    action: { id: 'checkin', label: 'Start check-in' },
    cmoOnly: false,
    escalates: true,
    source: 'team',
  },
  {
    id: 'device_gap',
    title: 'Check a sensor',
    when: 'When a device has no data for the demo day',
    done: 'Data arrives, or the reading is entered by hand',
    missedLabel: 'Sensor not checked',
    action: { id: 'checkin', label: 'Enter by hand' },
    cmoOnly: false,
    escalates: false,
    source: 'team',
  },
  {
    id: 'grip_weekly',
    title: 'Grip strength test',
    when: 'Once per mission week (day 7, 14 …)',
    done: 'A grip value recorded that week',
    missedLabel: 'Missed grip test',
    action: { id: 'grip', label: 'Open grip test' },
    cmoOnly: false,
    escalates: true,
    source: 'team',
  },
  {
    id: 'stand_test',
    title: 'Stand test',
    when: 'On arrival day and weekly, only where standing has an effect',
    done: 'A stand test saved that week',
    missedLabel: 'Missed stand test',
    action: { id: 'standtest', label: 'Start stand test' },
    cmoOnly: false,
    escalates: true,
    source: 'team',
  },
  {
    id: 'cmo_exam_followup',
    title: 'Examine a crew member',
    when: 'When someone is on alert with no exam in the last 24 h',
    done: 'An exam is recorded for them',
    missedLabel: null,
    action: { id: 'exam', label: 'Record an exam' },
    cmoOnly: true,
    escalates: false,
    source: 'team',
  },
  {
    id: 'ground_message',
    title: 'Read a message from the ground',
    when: 'A ground message is delivered and unread',
    done: 'It is opened',
    missedLabel: null,
    action: { id: 'message', label: 'Read message' },
    cmoOnly: true,
    escalates: false,
    source: 'team',
  },
]);

export const REMINDER_KIND = Object.freeze(Object.fromEntries(REMINDER_KINDS.map((k) => [k.id, k])));

/** The default `schedule` argument of remindersFor(). */
export const REMINDER_SCHEDULE = Object.freeze({ kinds: REMINDER_KINDS, settings: REMINDER_SETTINGS });

const hh = (h) => `${String(h).padStart(2, '0')}:00`;

/** "due by 10:00 crew time · snooze 1 h · …" for the panel footer (always followed by "Team-set"). */
export function settingsLine(s = REMINDER_SETTINGS) {
  return [
    `Due by ${hh(s.dueHour)} crew time`,
    `snooze ${s.snoozeMinutes / 60} h`,
    `no notifications ${hh(s.quietStartHour)}–${hh(s.quietEndHour)}`,
    `CMO sees ${s.cmoAfterDays} missed days, ground ${s.groundAfterDays}`,
  ].join(' · ');
}

/** Quiet hours as text: "22:00–06:00 crew time". */
export const quietHoursText = (s = REMINDER_SETTINGS) => `${hh(s.quietStartHour)}–${hh(s.quietEndHour)} crew time`;

// ---------- Activities ----------
// The app's schedule adds the daily Reaction Run reminder (content/activities.js) after the kinds above.
// REMINDER_KINDS and REMINDER_SCHEDULE stay exactly as they are; useReminders passes this schedule to the
// engine. The Reaction Run kind never escalates (no CMO marker, no ground list).

export const ACTIVITY_REMINDER_KINDS = Object.freeze([REACTION_REMINDER_KIND]);

/** The schedule the app runs: every kind above plus the activity kinds. */
export const APP_REMINDER_SCHEDULE = Object.freeze({ kinds: Object.freeze([...REMINDER_KINDS, ...ACTIVITY_REMINDER_KINDS]), settings: REMINDER_SETTINGS });
