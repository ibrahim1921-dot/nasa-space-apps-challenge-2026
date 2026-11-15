'use client';

// The demo clock and simulated events, shared by every view through localStorage and a window event.
// Any change (Advance one day, Back to the start, a new event) fires DEMO_CHANGED_EVENT, so every
// component using this hook re-reads the state right away; other tabs follow through `storage`.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { crewFile } from '../data/bundled.js';
import { browserStorage } from '../lib/identity.js';
import {
  DEMO_CHANGED_EVENT,
  DEMO_KEY,
  INITIAL_DEMO,
  addEvent as addEventTo,
  advanceDay,
  canAdvance,
  clockLimit,
  demoToday,
  effectiveOffset,
  notifyDemoChanged,
  parseDemo,
  readDemo,
  removeEvent as removeEventFrom,
  resetDemo,
  writeDemo,
} from '../lib/demoState.js';

/** The last crew.json day (the same for the whole crew) and its mission day. */
const lastDays = crewFile.crew.map((c) => [...c.days].sort((a, b) => a.day - b.day).at(-1));
export const LAST_CREW_DATE = lastDays.map((d) => d.date).sort().at(-1);
export const LAST_MISSION_DAY = Math.max(...lastDays.map((d) => d.missionDay ?? 0));

const realToday = () => new Date().toISOString().slice(0, 10);

export function useDemo() {
  const [state, setState] = useState(() => parseDemo(INITIAL_DEMO));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => setState(readDemo(browserStorage()));
    read();
    setReady(true);
    const onStorage = (e) => {
      if (e.key === DEMO_KEY) read();
    };
    window.addEventListener(DEMO_CHANGED_EVENT, read);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(DEMO_CHANGED_EVENT, read);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const real = realToday();
  const limit = useMemo(() => clockLimit({ lastDate: LAST_CREW_DATE, lastMissionDay: LAST_MISSION_DAY, realToday: real }), [real]);
  const offset = effectiveOffset(state, limit);
  const today = demoToday(LAST_CREW_DATE, offset);

  const update = useCallback((change) => {
    const storage = browserStorage();
    const next = change(readDemo(storage));
    writeDemo(next, storage);
    setState(parseDemo(next));
    notifyDemoChanged();
  }, []);

  return {
    ready,
    state,
    offset,
    today,
    realToday: real,
    missionDay: LAST_MISSION_DAY + offset,
    lastDate: LAST_CREW_DATE,
    limit,
    canAdvance: canAdvance(state, limit),
    advance: () => update((s) => advanceDay(s, limit)),
    reset: () => update(() => resetDemo()),
    addEvent: (event) => update((s) => addEventTo(s, event, limit)),
    removeEvent: (index) => update((s) => removeEventFrom(s, index)),
  };
}
