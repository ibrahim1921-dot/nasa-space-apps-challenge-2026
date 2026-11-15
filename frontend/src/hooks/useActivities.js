'use client';

// Activities for the app shell: this browser's activity log (every crew member, since the Crew Journey is
// shared), the signed-in person's patches, and saving a session. Re-reads when any record or the demo
// clock changes. Patches, once earned, are saved in `ahm.patches.v1` and never taken away.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { crewDaysOf } from '../data/bundled.js';
import { browserStorage } from '../lib/identity.js';
import { DEMO_CHANGED_EVENT, stampOnDemoDate } from '../lib/demoState.js';
import { RECORDS_CHANGED_EVENT, newRecordId } from '../lib/standTestStore.js';
import { REMINDERS_CHANGED_EVENT, notifyRemindersChanged } from '../lib/reminderStore.js';
import { readVitalsCheckins } from '../lib/vitalsCheckinStore.js';
import { makeActivity } from '../lib/activities.js';
import { ACTIVITIES_KEY, readActivities, writeActivity } from '../lib/activityStore.js';
import { earnedFromRecords, patchShelf } from '../lib/patches.js';
import { PATCHES_KEY, noteEmergencyDay, patchesOf, readPatchState, recordEarned, writePatchState } from '../lib/patchStore.js';
import { isOpen } from '../lib/emergency.js';

const WATCHED = new Set([ACTIVITIES_KEY, PATCHES_KEY, 'ahm.dailyVitals.v1', 'ahm.demo.v1']);

/**
 * @param {{ crewId: string, demo: object, profileId: string, emergencies?: object[] }} p
 */
export function useActivities({ crewId, demo, profileId, emergencies = [] }) {
  const [tick, setTick] = useState(0);
  const [records, setRecords] = useState([]);
  const [patchState, setPatchState] = useState({});

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    const onStorage = (e) => {
      if (!e.key || WATCHED.has(e.key)) refresh();
    };
    const events = [REMINDERS_CHANGED_EVENT, RECORDS_CHANGED_EVENT, DEMO_CHANGED_EVENT];
    events.forEach((e) => window.addEventListener(e, refresh));
    window.addEventListener('storage', onStorage);
    return () => {
      events.forEach((e) => window.removeEventListener(e, refresh));
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const storage = browserStorage();
    setRecords(readActivities(storage));
    setPatchState(readPatchState(storage));
  }, [tick]);

  const savePatches = useCallback((change) => {
    const storage = browserStorage();
    const cur = readPatchState(storage);
    const next = change(cur);
    if (next === cur) return;
    writePatchState(storage, next);
    setPatchState(next);
  }, []);

  // A tough day: the demo day on which this person is the patient in an open emergency.
  const emergencyOpen = emergencies.some((e) => e?.patient_crew_id === crewId && isOpen(e));
  useEffect(() => {
    if (demo.ready && emergencyOpen) savePatches((s) => noteEmergencyDay(s, crewId, demo.today));
  }, [demo.ready, emergencyOpen, crewId, demo.today, savePatches]);

  const own = useMemo(() => patchesOf(patchState, crewId), [patchState, crewId]);
  const fromRecords = useMemo(
    () =>
      earnedFromRecords({
        crewId,
        activities: records,
        checkins: readVitalsCheckins(crewId),
        emergencyDays: own.emergencyDays,
        crewDays: crewDaysOf(crewId),
        profileId,
        demoDate: demo.today,
      }),
    [crewId, records, own.emergencyDays, profileId, demo.today, tick], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Keep each patch's first earnedOn, so it is never taken away.
  useEffect(() => {
    if (demo.ready) savePatches((s) => recordEarned(s, crewId, fromRecords));
  }, [demo.ready, crewId, fromRecords, savePatches]);

  const patches = useMemo(() => patchShelf(fromRecords, own.earned), [fromRecords, own.earned]);

  /** Save one session for the signed-in person on the demo's today. @returns {{ ok: boolean, error?: string, record?: object }} */
  const save = useCallback(
    (kind, data) => {
      const record = makeActivity({ id: newRecordId(), crewId, kind, recordedAt: stampOnDemoDate(demo.today), data });
      const res = writeActivity(browserStorage(), record);
      if (res.ok) {
        setRecords((list) => [record, ...list.filter((r) => r.id !== record.id)]);
        notifyRemindersChanged(); // the bell re-reads; this hook re-reads too
      }
      return res.ok ? { ...res, record } : res;
    },
    [crewId, demo.today],
  );

  return { records, patches, save };
}
