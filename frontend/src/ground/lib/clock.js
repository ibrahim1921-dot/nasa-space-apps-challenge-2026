// The demo clock as the crew app sees it (ahm.demo.v1), computed with the same functions as
// hooks/useDemo.js. Pure apart from reading the storage passed in.

import { clockLimit, demoToday, effectiveOffset, readDemo } from '../../lib/demoState.js';
import { LAST_CREW_DATE, LAST_MISSION_DAY } from './data.js';

/**
 * @param {Storage|null} storage
 * @param {Date} realNow
 * @returns {{ state: object, offset: number, today: string, now: Date }}
 *   today: the demo's date (YYYY-MM-DD). now: the demo date at the real time of day, used to judge
 *   how old demo-timeline records are (they carry demo dates, not real ones).
 */
export function demoClock(storage, realNow = new Date()) {
  const state = readDemo(storage);
  const realIso = realNow.toISOString();
  const limit = clockLimit({ lastDate: LAST_CREW_DATE, lastMissionDay: LAST_MISSION_DAY, realToday: realIso.slice(0, 10) });
  const offset = effectiveOffset(state, limit);
  const today = demoToday(LAST_CREW_DATE, offset);
  return { state, offset, today, now: new Date(`${today}T${realIso.slice(11)}`) };
}
