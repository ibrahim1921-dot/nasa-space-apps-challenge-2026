'use client';

// The onboard connection for the whole app: who is using it (demo identity), whether the onboard
// server (the team's Java backend) is reachable, and the outbox loop that sends check-ins saved on
// this device to POST /api/crew/{crewId}/checkins.
//
// Everything works without the server: readings are always saved and scored on the device first.
// With NEXT_PUBLIC_USE_MOCKS=true (default) there is no backend at all and the app runs on its own
// mock API and bundled data.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_ACCOUNTS, isDemoWho } from '../lib/demoAccounts.js';
import { browserStorage, clearIdentity, readIdentity, writeIdentity } from '../lib/identity.js';
import { OUTBOX_STATE_KEY, nextDueAt, syncOnce, syncStateOf } from '../lib/outbox.js';
import { RECORDS_CHANGED_EVENT, readAllStandTests } from '../lib/standTestStore.js';
import { readAllVitals, writeVitalsCheckin } from '../lib/vitalsCheckinStore.js';
import { USE_MOCKS, backend, backendHealthy } from '../lib/backend.js';
import { makeBackendSender } from '../lib/backendSync.js';

const HEALTH_EVERY_MS = 30_000;
const LAST_COPY_KEY = 'ahm.lastCopyToGround.v1';

const OnboardContext = createContext(null);

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: retry bookkeeping lasts for this page view only
  }
}

/** Only daily check-ins go to the backend; the contract has no stand-test endpoint yet. */
const outboxRecords = () => readAllVitals();
const allRecords = () => [...readAllVitals(), ...readAllStandTests()];

/** Sends a batch of check-ins to POST /api/crew/{crewId}/checkins (lib/backendSync.js). */
const sendToBackend = makeBackendSender({ post: backend, savedRecords: readAllVitals });

export function OnboardProvider({ children }) {
  const [ready, setReady] = useState(false); // stored identity has been read
  const [who, setWho] = useState(null); // 'maya' | 'lena' | null (signed out)
  const account = who ? DEMO_ACCOUNTS[who] : null;

  // 'mock' | 'checking' | 'connected' | 'offline'
  const [server, setServer] = useState(USE_MOCKS ? 'mock' : 'checking');
  const [lastCopy, setLastCopy] = useState(null);
  const [outboxState, setOutboxState] = useState({});
  const [version, setVersion] = useState(0); // bumps when saved records change
  const running = useRef(false);
  const timer = useRef(null);
  const epoch = useRef(0); // bumped on sign-out / switch: an in-flight sync must not schedule more work

  useEffect(() => {
    setWho(readIdentity(browserStorage()));
    setLastCopy(readJson(LAST_COPY_KEY, null));
    setOutboxState(readJson(OUTBOX_STATE_KEY, {}));
    setReady(true);
  }, []);

  // ---- Is the onboard server there? ----
  const checkServer = useCallback(async () => {
    if (USE_MOCKS) return false;
    const ok = typeof navigator !== 'undefined' && navigator.onLine === false ? false : await backendHealthy();
    setServer(ok ? 'connected' : 'offline');
    return ok;
  }, []);

  useEffect(() => {
    if (USE_MOCKS) return undefined;
    checkServer();
    const id = setInterval(checkServer, HEALTH_EVERY_MS);
    window.addEventListener('online', checkServer);
    window.addEventListener('offline', checkServer);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', checkServer);
      window.removeEventListener('offline', checkServer);
    };
  }, [checkServer]);

  // ---- Outbox ----
  const stopOutbox = useCallback(() => {
    epoch.current += 1;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const runSync = useCallback(async () => {
    if (running.current || !account || server !== 'connected') return;
    const myEpoch = epoch.current;
    running.current = true;
    clearTimeout(timer.current);
    try {
      const state = readJson(OUTBOX_STATE_KEY, {});
      const out = await syncOnce({ records: outboxRecords(), crewId: account.crewId, state, now: Date.now(), send: sendToBackend });
      for (const r of out.updated) writeVitalsCheckin(r);
      writeJson(OUTBOX_STATE_KEY, out.state);
      setOutboxState(out.state);
      if (out.updated.length) {
        const newest = out.updated.map((r) => r.synced_at).sort().at(-1);
        writeJson(LAST_COPY_KEY, newest);
        setLastCopy(newest);
        setVersion((v) => v + 1);
      }
      if (out.error) checkServer();
      if (epoch.current !== myEpoch) return; // stopped: schedule nothing more
      const due = nextDueAt(outboxRecords(), account.crewId, out.state);
      if (due !== null) timer.current = setTimeout(() => runSync(), Math.max(1000, due - Date.now()));
    } finally {
      running.current = false;
    }
  }, [account, server, checkServer]);

  useEffect(() => {
    runSync();
  }, [runSync]);

  useEffect(() => {
    const onChange = () => {
      setVersion((v) => v + 1);
      setTimeout(() => runSync(), 0);
    };
    window.addEventListener(RECORDS_CHANGED_EVENT, onChange);
    window.addEventListener('online', onChange);
    return () => {
      window.removeEventListener(RECORDS_CHANGED_EVENT, onChange);
      window.removeEventListener('online', onChange);
      clearTimeout(timer.current);
    };
  }, [runSync]);

  // ---- Enter, switch, sign out (readings saved on the device are never touched) ----
  const enter = useCallback(
    (next) => {
      if (!isDemoWho(next) || next === who) return;
      stopOutbox();
      writeIdentity(browserStorage(), next);
      setWho(next);
    },
    [who, stopOutbox],
  );

  const signOut = useCallback(() => {
    stopOutbox();
    clearIdentity(browserStorage());
    setWho(null);
  }, [stopOutbox]);

  const pendingCount = useMemo(
    () => (typeof window === 'undefined' || USE_MOCKS ? 0 : outboxRecords().filter((r) => !r.synced_at).length),
    [version], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const value = useMemo(
    () => ({
      ready,
      who,
      account,
      crewId: account?.crewId ?? null,
      isCmo: account?.role === 'cmo',
      enter,
      signOut,
      busy: false,
      server,
      mock: USE_MOCKS,
      connected: server === 'connected',
      signedIn: Boolean(account && server === 'connected'),
      lastCopy,
      version,
      pendingCount,
      records: allRecords,
      syncState: (record) => syncStateOf(record, outboxState),
    }),
    [ready, who, account, enter, signOut, server, lastCopy, version, pendingCount, outboxState],
  );

  return <OnboardContext.Provider value={value}>{children}</OnboardContext.Provider>;
}

export function useOnboard() {
  const ctx = useContext(OnboardContext);
  if (!ctx) throw new Error('useOnboard must be used inside <OnboardProvider>.');
  return ctx;
}
