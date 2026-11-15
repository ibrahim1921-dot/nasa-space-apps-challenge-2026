'use client';

// The one source of reminders for the app shell: the bell, the "Due today" card, the CMO's Crew overview
// markers and the ground list all read this hook's result, so they always agree.
// It gathers this browser's records, runs the pure engine (lib/reminders.js) and re-runs it when the demo
// clock moves, a record is saved, a reminder is snoozed, a ground message changes, or every minute (the
// real clock decides the time of day). Browser notifications are sent from here, only while the app is open.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { crewDaysOf, fitnessFile } from '../data/bundled.js';
import { crewRoster } from '../mocks/crew.js';
import { browserStorage } from '../lib/identity.js';
import { DEMO_CHANGED_EVENT, stampOnDemoDate } from '../lib/demoState.js';
import { sensorDaysFor } from '../lib/deviceScoring.js';
import { environmentRules } from '../lib/environmentRules.js';
import { RECORDS_CHANGED_EVENT, newRecordId, readStandTests } from '../lib/standTestStore.js';
import { readVitalsCheckins } from '../lib/vitalsCheckinStore.js';
import { makeGripEntry, readGripLog, writeGripEntry } from '../lib/gripLog.js';
import { inboxFor, markRead as markMessageRead } from '../lib/groundInbox.js';
import { ACTIVITIES_KEY, readActivities } from '../lib/activityStore.js';
import { APP_REMINDER_SCHEDULE } from '../content/reminderSchedule.js';
import { GROUND_MESSAGES_CHANGED_EVENT, GROUND_MESSAGES_KEY, readMessages } from '../ground/lib/messages.js';
import {
  REMINDERS_CHANGED_EVENT,
  REMINDERS_KEY,
  markNotified,
  noteArrival,
  notToday as notTodayIn,
  notifyRemindersChanged,
  readReminderState,
  setNotify,
  snooze as snoozeIn,
  writeReminderState,
} from '../lib/reminderStore.js';
import {
  bellCount,
  crewMissedMarkers,
  dueTodayTop,
  groundEscalations,
  missedItemsFor,
  notificationsToSend,
  remindersFor,
} from '../lib/reminders.js';

const WATCHED_KEYS = new Set([REMINDERS_KEY, GROUND_MESSAGES_KEY, 'ahm.dailyVitals.v1', 'ahm.standTests.v1', 'ahm.gripLog.v1', 'ahm.demo.v1', ACTIVITIES_KEY]);
const fitnessWeeksOf = (id) => fitnessFile.crew.find((c) => c.crewId === id)?.inflight_grip ?? [];
const isExam = (r) => r?.payload?.kind_detail === 'cmo_exam';

function permissionNow() {
  try {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  } catch {
    return 'unsupported';
  }
}

/**
 * @param {{ crewId: string, role: 'crew'|'cmo', demo: object, profile: object, crewStatus?: { id, name, status }[] }} p
 */
export function useReminders({ crewId, role, demo, profile, crewStatus = [] }) {
  const [tick, setTick] = useState(0);
  const [store, setStore] = useState(() => readReminderState(null));
  const [permission, setPermission] = useState('unsupported');

  useEffect(() => {
    const refresh = () => {
      setStore(readReminderState(browserStorage()));
      setTick((t) => t + 1);
    };
    refresh();
    setPermission(permissionNow());
    const onStorage = (e) => {
      if (!e.key || WATCHED_KEYS.has(e.key)) refresh();
    };
    const events = [REMINDERS_CHANGED_EVENT, RECORDS_CHANGED_EVENT, GROUND_MESSAGES_CHANGED_EVENT, DEMO_CHANGED_EVENT];
    events.forEach((e) => window.addEventListener(e, refresh));
    window.addEventListener('storage', onStorage);
    const timer = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, refresh));
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
  }, []);

  const update = useCallback((change) => {
    const storage = browserStorage();
    const next = change(readReminderState(storage));
    writeReminderState(storage, next);
    setStore(next);
    notifyRemindersChanged();
  }, []);

  // Stand test: remember the first demo date this device saw a gravity profile ("arrival day").
  const standAvailable = environmentRules(profile).standTest.available;
  useEffect(() => {
    if (standAvailable && demo.ready && !store.arrival[profile.id]) update((s) => noteArrival(s, profile.id, demo.today));
  }, [standAvailable, demo.ready, demo.today, profile.id, store.arrival, update]);

  const result = useMemo(() => {
    const storage = browserStorage();
    const now = Date.now();
    const demoDate = demo.today;
    const recordsOf = (id) => ({
      checkins: readVitalsCheckins(id),
      standTests: readStandTests(id),
      grip: readGripLog(storage, id),
      crewDays: crewDaysOf(id),
      fitnessWeeks: fitnessWeeksOf(id),
      arrivalDate: store.arrival[profile.id] ?? null,
      activities: readActivities(storage).filter((r) => r.crew_id === id),
    });
    const cmo = role === 'cmo';
    const own = recordsOf(crewId);
    const records = {
      ...own,
      ...(cmo
        ? {
            crew: crewStatus.map((c) => ({ id: c.id, name: c.name, status: c.status, exams: readVitalsCheckins(c.id).filter(isExam) })),
            messages: readMessages(storage),
          }
        : {}),
    };
    const items = remindersFor({
      crewId,
      role,
      records,
      timeline: sensorDaysFor(crewId, demo.state, demoDate),
      profile,
      demoDate,
      now,
      dismissed: store.entries,
      schedule: APP_REMINDER_SCHEDULE, // every reminder kind plus the daily Reaction Run (never escalates)
    });
    // Missed items for everyone (dismissals never hide these): CMO markers and the ground list.
    const missed = crewRoster.flatMap((c) =>
      missedItemsFor({ crewId: c.id, records: recordsOf(c.id), timeline: sensorDaysFor(c.id, demo.state, demoDate), profile, demoDate, now }),
    );
    return {
      items,
      now,
      count: bellCount(items),
      dueToday: dueTodayTop(items),
      markers: cmo ? crewMissedMarkers(missed) : new Map(),
      ground: groundEscalations(missed),
      gripEntries: own.grip,
      inbox: cmo ? inboxFor(storage, { crewId, role, now }) : [],
    };
  }, [tick, store, crewId, role, demo.state, demo.today, profile, crewStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Browser notifications: while the app is open, at most one per reminder per day, none in quiet hours.
  useEffect(() => {
    if (!demo.ready) return;
    const send = notificationsToSend({
      items: result.items,
      crewId,
      demoDate: demo.today,
      now: result.now,
      notified: store.notified,
      enabled: store.notify,
      permission,
    });
    if (!send.length) return;
    for (const item of send) {
      try {
        new Notification(item.title, { body: item.detail, tag: `ahm-${item.id}` }); // eslint-disable-line no-new
      } catch {
        // some browsers only allow notifications from a service worker; the bell still shows it
      }
    }
    update((s) => send.reduce((acc, item) => markNotified(acc, { crewId, reminderId: item.id, demoDate: demo.today, now: result.now }), s));
  }, [result, store.notify, store.notified, permission, crewId, demo.today, demo.ready, update]);

  const snooze = useCallback(
    (item) => update((s) => snoozeIn(s, { crewId, reminderId: item.id, demoDate: demo.today })),
    [crewId, demo.today, update],
  );
  const notToday = useCallback(
    (item, reason = '') => update((s) => notTodayIn(s, { crewId, reminderId: item.id, demoDate: demo.today, reason })),
    [crewId, demo.today, update],
  );

  /** "Allow reminders on this device": asks for permission when switched on. */
  const setNotifications = useCallback(
    async (on) => {
      let p = permissionNow();
      if (on && p === 'default') {
        try {
          p = await Notification.requestPermission();
        } catch {
          p = permissionNow();
        }
      }
      setPermission(p);
      update((s) => setNotify(s, on));
    },
    [update],
  );

  /** Log one grip value (kg) on the demo's today. @returns {{ ok: boolean, error?: string }} */
  const logGrip = useCallback(
    (kg) => {
      const res = writeGripEntry(browserStorage(), makeGripEntry({ crewId, kg, recordedAt: stampOnDemoDate(demo.today), id: newRecordId() }));
      if (res.ok) notifyRemindersChanged();
      return res;
    },
    [crewId, demo.today],
  );

  const markRead = useCallback(
    (messageId) => markMessageRead(browserStorage(), messageId, { crewId, role, now: Date.now() }),
    [crewId, role],
  );

  return {
    ...result,
    snooze,
    notToday,
    logGrip,
    markRead,
    notify: { enabled: store.notify, permission, set: setNotifications },
  };
}
