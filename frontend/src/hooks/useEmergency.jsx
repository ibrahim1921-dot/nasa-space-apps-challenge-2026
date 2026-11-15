'use client';

// Emergency mode for the whole app (lib/emergency.js). Sits above the landing page and the app shell, so
// the Emergency button, the red band and the guide work on every screen, signed in or not, and offline.
//
// Saved on this device first (ahm.emergency.v1). When signed in and connected, records this person may
// write (their own, or any already on the server for the CMO) are sent to POST /api/emergency; the
// server's merged copy comes back and is merged here. While signed in, connected and the tab is visible,
// the device polls every 15 s: the CMO for every open emergency, crew only for open emergencies where
// the CMO is the patient. A record reported while signed out stays on this device only, and the band
// and live view still read it from local storage (one-laptop demo).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useOnboard } from './useOnboard.jsx';
import { useDemo } from './useDemo.js';
import { browserStorage } from '../lib/identity.js';
import { newRecordId } from '../lib/standTestStore.js';
import { readVitalsCheckins } from '../lib/vitalsCheckinStore.js';
import { onOrBefore } from '../lib/demoState.js';
import { sensorDaysFor } from '../lib/deviceScoring.js';
import { timelineItems } from '../lib/sensorRecords.js';
import { buildTimeline } from '../lib/vitalsCheckin.js';
import { crewDaysOf } from '../data/bundled.js';
import { DEFAULT_PROFILE_ID, PROFILES_BY_ID } from '../constants/mission.js';
import {
  CMO_IDS,
  EMERGENCY_CHANGED_EVENT,
  EMERGENCY_KEY,
  addEvent,
  applyServerCopy,
  endEmergency,
  environmentFor,
  forServer,
  fromRow,
  latestReadingsFrom,
  mergeAll,
  newEmergency,
  readEmergencies,
  setEnvironment,
  summaryText,
  switchToCollapse,
  toSend,
  upsertLocal,
  writeEmergencies,
} from '../lib/emergency.js';
import { getProfile } from '../constants/mission.js';
import EmergencyBand from '../components/EmergencyBand.jsx';
import EmergencyGuide from '../components/EmergencyGuide.jsx';

export const POLL_EVERY_MS = 15_000;
const PROFILE_KEY = 'ahm.missionProfile.v1';
const PERMANENT = new Set([400, 403, 409]);
const COLUMNS = 'id, patient_crew_id, reporter_crew_id, reporter_name, flow, environment, drill, started_at, ended_at, events';

const EmergencyContext = createContext(null);

/** The mission profile chosen in the header (read fresh: the header may have changed it). */
function readProfileId() {
  try {
    const v = JSON.parse(window.localStorage.getItem(PROFILE_KEY));
    return v in PROFILES_BY_ID ? v : DEFAULT_PROFILE_ID;
  } catch {
    return DEFAULT_PROFILE_ID;
  }
}

export function EmergencyProvider({ children }) {
  const onboard = useOnboard();
  const { supabase, connected, signedIn, crewId, isCmo, account } = onboard;
  const demo = useDemo();
  const online = Boolean(connected && signedIn && supabase && crewId);

  const [local, setLocal] = useState([]);
  const [server, setServer] = useState([]);
  const [view, setView] = useState(null); // null | { mode: 'start' } | { mode: 'guide'|'live'|'end'|'summary', id }
  const [hidden, setHidden] = useState(false); // guide tucked away while the CMO records an exam
  const [delivery, setDelivery] = useState({}); // id -> 'server' | 'device' | 'rejected'
  const sending = useRef(false);
  const flushRef = useRef(null);
  const examOpener = useRef(null);

  // ---- Device copy ----
  const reload = useCallback(() => setLocal(readEmergencies(browserStorage())), []);
  useEffect(() => {
    reload();
    const onStorage = (e) => {
      if (e.key === EMERGENCY_KEY) reload();
    };
    window.addEventListener(EMERGENCY_CHANGED_EVENT, reload);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EMERGENCY_CHANGED_EVENT, reload);
      window.removeEventListener('storage', onStorage);
    };
  }, [reload]);

  const writeLocal = useCallback((list) => {
    writeEmergencies(browserStorage(), list);
    setLocal(readEmergencies(browserStorage()));
    window.dispatchEvent(new Event(EMERGENCY_CHANGED_EVENT));
  }, []);

  // ---- Device only in the monorepo ----
  // The practice app sent emergencies to its Supabase onboard server (/api/emergency); that server is
  // not ported and the Java backend has no emergency endpoint yet, so emergencies stay on this device.
  const flush = useCallback(async () => false, []);

  flushRef.current = flush;

  const fetchRows = useCallback(async () => {}, []);

  useEffect(() => {
    setServer([]);
    if (!online) return undefined;
    fetchRows(false);
    flush();
    let timer = null;
    const tick = () => {
      fetchRows(true);
      flush();
    };
    const start = () => {
      if (timer || document.visibilityState === 'hidden') return;
      timer = setInterval(tick, POLL_EVERY_MS);
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
      else {
        tick();
        start();
      }
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [online, crewId, fetchRows, flush]);

  const all = useMemo(() => mergeAll(server, local), [server, local]);
  const byId = useCallback((id) => all.find((e) => e.id === id) ?? null, [all]);

  // ---- Changes (always to the device copy first) ----
  const change = useCallback(
    (id, fn, { send = true } = {}) => {
      const list = readEmergencies(browserStorage());
      const current = list.find((e) => e.id === id) ?? all.find((e) => e.id === id);
      if (!current) return null;
      const next = fn(current);
      if (next === current) return current;
      writeLocal(upsertLocal(list, next));
      if (!next.reporter.crew_id || !online) setDelivery((d) => ({ ...d, [id]: 'device' }));
      if (send) flush();
      return next;
    },
    [all, writeLocal, flush, online],
  );

  const me = crewId ?? null;
  const actions = useMemo(
    () => ({
      openStart: () => {
        setHidden(false);
        setView({ mode: 'start' });
      },
      cancelStart: () => setView(null),
      start: ({ patientCrewId, flow, environment, drill }) => {
        const em = newEmergency({
          id: newRecordId(),
          eventId: newRecordId(),
          patientCrewId,
          reporter: account ? { crew_id: crewId, name: account.name } : null,
          flow,
          environment,
          drill,
        });
        writeLocal(upsertLocal(readEmergencies(browserStorage()), em));
        setDelivery((d) => ({ ...d, [em.id]: online && em.reporter.crew_id ? 'pending' : 'device' }));
        flush();
        setView({ mode: 'guide', id: em.id });
        return em;
      },
      log: (id, type, detail) => change(id, (em) => addEvent(em, { id: newRecordId(), type, by: me, detail })),
      collapse: (id) => change(id, (em) => switchToCollapse(em, { id: newRecordId(), at: new Date().toISOString(), by: me })),
      setEnvironment: (id, env) => change(id, (em) => setEnvironment(em, env)),
      end: (id, note) => {
        change(id, (em) => endEmergency(em, { by: me, note: note ?? '', noteId: newRecordId() }));
        setView({ mode: 'summary', id });
      },
      /** "Alert the CMO" / "Alert the crew": log it and send now. @returns {Promise<'server'|'device'>} */
      alert: async (id) => {
        const em = change(id, (e) => addEvent(e, { id: newRecordId(), type: 'alert_sent', by: me }), { send: false });
        const ok = Boolean(online && em?.reporter.crew_id && (await flush()));
        const where = ok ? 'server' : 'device';
        setDelivery((d) => ({ ...d, [id]: where }));
        return where;
      },
      show: (mode, id) => {
        setHidden(false);
        setView({ mode, id });
      },
      close: () => setView(null),
      recordExam: (patientId) => {
        if (!examOpener.current) return;
        setHidden(true);
        examOpener.current(patientId);
      },
    }),
    [account, crewId, online, me, writeLocal, flush, change],
  );

  /** The patient's latest readings (buildTimeline on the demo's today) for the summary. */
  const readingsFor = useCallback(
    (patientId) => {
      if (!patientId) return null;
      const crewDays = crewDaysOf(patientId);
      if (!crewDays.length) return null;
      const saved = timelineItems(onOrBefore(readVitalsCheckins(patientId), demo.today));
      const timeline = buildTimeline({ crewDays, sensorDays: sensorDaysFor(patientId, demo.state, demo.today), saved });
      return latestReadingsFrom(timeline, { today: demo.today, seededCount: crewDays.length });
    },
    [demo.state, demo.today],
  );

  const summaryFor = useCallback(
    (em) => summaryText(em, readingsFor(em.patient_crew_id), getProfile(readProfileId()).delayText),
    [readingsFor],
  );

  const value = useMemo(
    () => ({
      all,
      byId,
      view,
      hidden,
      delivery,
      actions,
      summaryFor,
      profileId: readProfileId,
      defaultEnvironment: () => environmentFor(readProfileId()),
      /** App shell: how the guide opens the existing exam form (CMO only). */
      registerExam: (fn) => {
        examOpener.current = fn;
        return () => {
          if (examOpener.current === fn) examOpener.current = null;
        };
      },
      canRecordExam: () => Boolean(examOpener.current),
      returnToGuide: () => setHidden(false),
    }),
    [all, byId, view, hidden, delivery, actions, summaryFor],
  );

  return (
    <EmergencyContext.Provider value={value}>
      <EmergencyBand />
      {children}
      {view && !hidden && <EmergencyGuide />}
    </EmergencyContext.Provider>
  );
}

export function useEmergency() {
  const ctx = useContext(EmergencyContext);
  if (!ctx) throw new Error('useEmergency must be used inside <EmergencyProvider>.');
  return ctx;
}
