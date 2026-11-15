// Activities (More → Activities): three short games and mission patches.
// Every value here is the team's choice, not a clinical standard (`source: 'team'`, shown as "Team-set").
// Game data is logged, never scored: no value here is a limit, and no game record changes a status.

export const LOGGED_NOT_SCORED = 'Logged · not scored';
export const GAME_SCALE_LABEL = 'Team-set · game scale';
export const TOUGH_DAYS_TEXT = 'Tough days don’t break your run';

export const ACTIVITY_KINDS = Object.freeze(['reaction_run', 'calm_orbit', 'crew_journey']);

/** Team-set values. */
export const ACTIVITY_SETTINGS = Object.freeze({
  source: 'team',
  dailyCap: 3, // sessions of each game per demo day
  reaction: Object.freeze({
    sessionMs: 3 * 60 * 1000,
    minWaitMs: 2000,
    maxWaitMs: 10000,
    lapseMs: 500, // a reaction over this is a lapse
    timeoutMs: 5000, // no tap this long after the stimulus: a lapse with no time
    baselineSessions: 7, // "Your usual" = median of the last 7 sessions …
    baselineMinSessions: 3, // … shown from 3 sessions on
  }),
  calm: Object.freeze({ minutes: 2, inhaleS: 5, exhaleS: 5 }),
  journey: Object.freeze({ minMinutes: 5, maxMinutes: 120 }),
  patches: Object.freeze({ graceDaysPerMonth: 2, missionMonthDays: 30, streakDays: 5, weekDays: 7, weekNeeded: 5, calmCount: 7 }),
});

export const FEELINGS = Object.freeze([
  { value: 'calmer', label: 'Calmer' },
  { value: 'same', label: 'Same' },
  { value: 'worse', label: 'Worse' },
]);

export const EXERCISE_TYPES = Object.freeze([
  { value: 'treadmill', label: 'Treadmill' },
  { value: 'bike', label: 'Bike' },
  { value: 'resistance', label: 'Resistance' },
]);

/** The three game cards. */
export const GAMES = Object.freeze([
  { kind: 'reaction_run', name: 'Reaction Run', helps: 'Tracks alertness, like the reaction test crews take on the station.', time: 'About 3 min' },
  { kind: 'calm_orbit', name: 'Calm Orbit', helps: 'Slow breathing to settle your body and mind. Open at any hour.', time: '2 min' },
  { kind: 'crew_journey', name: 'Crew Journey', helps: 'Log your exercise; the whole crew’s minutes move one ship.', time: 'About 1 min' },
]);

/**
 * Crew Journey routes. Scales are game scales (team-set), not real distances.
 * Milestone `km` is where the note is reached on that route.
 */
export const ROUTES = Object.freeze({
  moon: Object.freeze({
    id: 'moon',
    from: 'Earth',
    to: 'Moon',
    totalKm: 384_400,
    kmPerMinute: 1_000,
    milestones: Object.freeze([
      { id: 'leo', note: 'Left low Earth orbit', km: 2_000 },
      { id: 'belts', note: 'Passed the Van Allen belts', km: 60_000 },
      { id: 'half', note: 'Halfway to the Moon', km: 192_200 },
      { id: 'arrived', note: 'Arrived at the Moon', km: 384_400 },
    ]),
  }),
  mars: Object.freeze({
    id: 'mars',
    from: 'Earth',
    to: 'Mars',
    totalKm: 225_000_000,
    kmPerMinute: 500_000,
    milestones: Object.freeze([
      { id: 'leo', note: 'Left Earth orbit', km: 1 },
      { id: 'moon', note: 'Passed the Moon’s distance', km: 384_400 },
      { id: 'half', note: 'Halfway to Mars', km: 112_500_000 },
      { id: 'arrived', note: 'Arrived at Mars', km: 225_000_000 },
    ]),
  }),
});

export const ROUTE_BY_PROFILE = Object.freeze({ iss: 'moon', lunar_transit: 'moon', moon: 'moon', mars: 'mars', mars_surface: 'mars' });

/** Mission patches, earned only by taking part. */
export const PATCHES = Object.freeze([
  { id: 'first_reaction', name: 'First Reaction Run' },
  { id: 'reaction_streak', name: 'Reaction Run 5 days in a row' },
  { id: 'first_calm', name: 'First Calm Orbit' },
  { id: 'calm_seven', name: '7 Calm Orbits' },
  { id: 'first_exercise', name: 'First exercise logged' },
  { id: 'crew_halfway', name: 'Crew reached halfway' },
  { id: 'crew_arrived', name: 'Crew arrived' },
  { id: 'full_week', name: 'Full week: a Reaction Run, a Calm Orbit and exercise on 5 of 7 days' },
]);

/** The daily Reaction Run reminder (added to the app's schedule beside REMINDER_KINDS; never escalates). */
export const REACTION_REMINDER_KIND = Object.freeze({
  id: 'reaction_daily',
  title: 'Reaction Run',
  when: 'Every day by 12:00 crew time',
  done: 'A Reaction Run logged on that demo date',
  missedLabel: null,
  action: { id: 'activity', game: 'reaction_run', label: 'Play Reaction Run' },
  cmoOnly: false,
  escalates: false,
  dueHour: 12,
  source: 'team',
});
