'use client';

// Who is signed in, for the whole app, and whether the backend is reachable.
//
// Live mode (lib/session.js): the backend session cookie is the identity. On load, GET /api/auth/me
// says who is signed in (if anyone); login is POST /api/auth/login, sign-out POST /api/auth/logout
// (lib/api.js handles CSRF). Any 401 from an authenticated call signs the person out here and returns
// to the login screen; a 401/403 is never treated as offline success.
//
// Demo mode: "Explore with demo data" opens the local demo crew without the backend. Labelled in the UI.
//
// Readings (check-ins, stand tests, sensor days, exams) stay local-first in both modes: saved and scored
// on this device. The practice app's Supabase outbox sync is not part of the monorepo; the real backend
// has no endpoint to receive them yet (see the integration report).
//
// The context keeps the keys the ported screens read (`supabase`, `signedIn`, `syncState`, ...): with
// `supabase: null` every Supabase-backed panel uses its local path.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { browserStorage, readIdentity, writeIdentity } from '../lib/identity.js';
import { accountFromIdentity, demoAccountFor, signOutFlow } from '../lib/session.js';
import { syncStateOf } from '../lib/outbox.js';
import { RECORDS_CHANGED_EVENT, readAllStandTests } from '../lib/standTestStore.js';
import { readAllVitals } from '../lib/vitalsCheckinStore.js';

const PING_EVERY_MS = 60_000;

const OnboardContext = createContext(null);

const allRecords = () => [...readAllVitals(), ...readAllStandTests()];

export function OnboardProvider({ children }) {
  const [ready, setReady] = useState(false); // the session (or stored demo person) has been read
  const [account, setAccount] = useState(null); // lib/session.js account, or null (signed out)
  const [identity, setIdentity] = useState(null); // backend AccountIdentity in live mode
  // Backend reachability: 'checking' | 'connected' | 'offline'
  const [server, setServer] = useState('checking');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // e.g. "Your session has ended"
  const [version, setVersion] = useState(0); // bumps when saved records change
  const accountRef = useRef(null);
  accountRef.current = account;

  const goLive = useCallback((id) => {
    const next = accountFromIdentity(id);
    setIdentity(next ? id : null);
    setAccount(next);
    return next;
  }, []);

  // ---- On load: a live session first, else a stored demo person ----
  useEffect(() => {
    let active = true;
    (async () => {
      let live = null;
      try {
        live = goLive(await api.me());
        if (active) setServer('connected');
      } catch (err) {
        if (active) setServer(err?.kind === 'unreachable' ? 'offline' : 'connected');
      }
      if (!active) return;
      if (!live) {
        const demo = demoAccountFor(readIdentity(browserStorage()));
        if (demo) setAccount(demo);
      }
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [goLive]);

  // ---- Session expiry: any authenticated 401 returns to the login screen ----
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      if (accountRef.current?.mode !== 'live') return;
      setAccount(null);
      setIdentity(null);
      setNotice('Your session has ended. Please sign in again.');
    });
    return () => api.setUnauthorizedHandler(null);
  }, []);

  // ---- Is the backend there? (public CSRF route; only while signed out or live) ----
  const checkServer = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setServer('offline');
      return false;
    }
    const ok = await api.ping();
    setServer(ok ? 'connected' : 'offline');
    return ok;
  }, []);

  useEffect(() => {
    if (account?.mode === 'demo') return undefined;
    const id = setInterval(checkServer, PING_EVERY_MS);
    window.addEventListener('online', checkServer);
    window.addEventListener('offline', checkServer);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', checkServer);
      window.removeEventListener('offline', checkServer);
    };
  }, [checkServer, account?.mode]);

  useEffect(() => {
    const onChange = () => setVersion((v) => v + 1);
    window.addEventListener(RECORDS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(RECORDS_CHANGED_EVENT, onChange);
  }, []);

  // ---- Log in (live), explore (demo), sign out ----
  /** POST /api/auth/login. Throws ApiError (wrong login, rate limited, unreachable...) for the form. */
  const login = useCallback(
    async (loginName, password) => {
      setBusy(true);
      try {
        const id = await api.login(loginName.trim(), password);
        setServer('connected');
        setNotice(null);
        const next = goLive(id);
        if (!next) throw new Error('This account has no role this app can show.');
        return next;
      } finally {
        setBusy(false);
      }
    },
    [goLive],
  );

  /** "Explore with demo data": local demo crew, no backend. */
  const enter = useCallback(
    (who) => {
      const demo = demoAccountFor(who);
      if (!demo || busy) return;
      writeIdentity(browserStorage(), who);
      setNotice(null);
      setAccount(demo);
    },
    [busy],
  );

  const signOut = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOutFlow({ account: accountRef.current, api, storage: browserStorage() });
      setAccount(null);
      setIdentity(null);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const pendingCount = useMemo(
    () => (typeof window === 'undefined' ? 0 : allRecords().filter((r) => !r.synced_at).length),
    [version], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const value = useMemo(
    () => ({
      ready,
      account,
      identity,
      mode: account?.mode ?? null,
      isLive: account?.mode === 'live',
      isDemo: account?.mode === 'demo',
      isOfficer: account?.role === 'officer',
      // `who` is the screen switch (signed in or not) and the key into the local demo records.
      who: account ? (account.who ?? account.loginName ?? 'officer') : null,
      crewId: account?.crewId ?? null,
      astronautId: account?.astronautId ?? null,
      isCmo: account?.role === 'cmo',
      login,
      enter,
      signOut,
      busy,
      notice,
      server,
      connected: server === 'connected',
      signedIn: account?.mode === 'live',
      signInError: null,
      supabase: null,
      lastCopy: null,
      version,
      pendingCount,
      syncState: (record) => syncStateOf(record, {}),
    }),
    [ready, account, identity, login, enter, signOut, busy, notice, server, version, pendingCount],
  );

  return <OnboardContext.Provider value={value}>{children}</OnboardContext.Provider>;
}

export function useOnboard() {
  const ctx = useContext(OnboardContext);
  if (!ctx) throw new Error('useOnboard must be used inside <OnboardProvider>.');
  return ctx;
}
