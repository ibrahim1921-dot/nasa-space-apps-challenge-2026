// Demo clock and events. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_KEY,
  INITIAL_DEMO,
  addEvent,
  advanceDay,
  canAdvance,
  clockLimit,
  demoToday,
  effectiveOffset,
  eventStatus,
  eventsFor,
  onOrBefore,
  parseDemo,
  readDemo,
  removeEvent,
  resetDemo,
  writeDemo,
} from './demoState.js';

const LAST = '2026-10-30';
const memoryStorage = (seed = {}) => {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
};
const limit = clockLimit({ lastDate: LAST, lastMissionDay: 142, realToday: '2026-11-14' });

test('starts one day after the last crew.json day, so the first morning has a sensor night', () => {
  assert.deepEqual(parseDemo(null), { dayOffset: 1, events: [] });
  assert.equal(INITIAL_DEMO.dayOffset, 1);
  assert.equal(demoToday(LAST, 1), '2026-10-31');
});

test('stored state is validated: bad values fall back, bad events are dropped', () => {
  assert.deepEqual(parseDemo({ dayOffset: -2, events: 'x' }), { dayOffset: 1, events: [] });
  assert.deepEqual(parseDemo({ dayOffset: 2.5 }), { dayOffset: 1, events: [] });
  const s = parseDemo({
    dayOffset: 4,
    events: [{ crewId: 'crew-02', type: 'fever', startOffset: 2, extra: 1 }, { crewId: 'crew-02', type: 'flu', startOffset: 2 }, null],
  });
  assert.deepEqual(s, { dayOffset: 4, events: [{ crewId: 'crew-02', type: 'fever', startOffset: 2 }] });
});

test('read and write with a memory storage; corrupt JSON gives the initial state', () => {
  const storage = memoryStorage();
  assert.deepEqual(readDemo(storage), { dayOffset: 1, events: [] });
  assert.equal(writeDemo({ dayOffset: 3, events: [] }, storage), true);
  assert.deepEqual(readDemo(storage), { dayOffset: 3, events: [] });
  assert.deepEqual(readDemo(memoryStorage({ [DEMO_KEY]: '{not json' })), { dayOffset: 1, events: [] });
  assert.deepEqual(readDemo(null), { dayOffset: 1, events: [] });
  const full = { getItem: () => null, setItem: () => { throw new Error('full'); } };
  assert.equal(writeDemo({ dayOffset: 3, events: [] }, full), false);
});

test('the clock stops at the real date (the onboard server refuses future readings)', () => {
  assert.deepEqual(limit, { maxOffset: 15, reason: 'real', date: '2026-11-14' });
  let s = { dayOffset: 14, events: [] };
  assert.equal(canAdvance(s, limit), true);
  s = advanceDay(s, limit);
  assert.equal(s.dayOffset, 15);
  assert.equal(canAdvance(s, limit), false);
  assert.equal(advanceDay(s, limit).dayOffset, 15);
});

test('the clock stops at mission day 180 when that comes first', () => {
  const later = clockLimit({ lastDate: LAST, lastMissionDay: 142, realToday: '2027-06-01' });
  assert.equal(later.maxOffset, 38);
  assert.equal(later.reason, 'mission');
  assert.equal(later.date, '2026-12-07');
  // A stored offset past the limit is not used.
  assert.equal(effectiveOffset({ dayOffset: 30, events: [] }, limit), 15);
});

test('events start tomorrow (demo time) and run for their type’s number of days', () => {
  let s = { dayOffset: 3, events: [] };
  s = addEvent(s, { crewId: 'crew-02', type: 'fever' }, limit);
  assert.deepEqual(s.events, [{ crewId: 'crew-02', type: 'fever', startOffset: 4 }]);
  assert.deepEqual(addEvent(s, { crewId: 'crew-02', type: 'flu' }, limit), s, 'unknown type is ignored');
  assert.equal(addEvent(s, { crewId: 'crew-02', type: 'fever' }, limit).events.length, 1, 'no duplicate');
  assert.deepEqual(eventStatus(s.events[0], 3, LAST), { status: 'upcoming', from: '2026-11-03', to: '2026-11-05' });
  assert.equal(eventStatus(s.events[0], 5, LAST).status, 'active');
  assert.equal(eventStatus(s.events[0], 7, LAST).status, 'ended');
  assert.deepEqual(eventsFor(s, 'crew-01'), []);
  assert.deepEqual(removeEvent(s, 0).events, []);
});

test('Back to the start resets only the demo state; saved check-ins in storage are untouched', () => {
  const checkins = JSON.stringify([{ id: 'a' }]);
  const storage = memoryStorage({ 'ahm.dailyVitals.v1': checkins });
  writeDemo({ dayOffset: 9, events: [{ crewId: 'crew-02', type: 'fever', startOffset: 3 }] }, storage);
  writeDemo(resetDemo(), storage);
  assert.deepEqual(readDemo(storage), { dayOffset: 1, events: [] });
  assert.equal(storage.getItem('ahm.dailyVitals.v1'), checkins);
});

test('records dated after the demo’s today are hidden, not removed, and return when the clock reaches them', () => {
  const records = [{ recorded_at: '2026-10-31T07:00:00.000Z' }, { recorded_at: '2026-11-14T09:00:00.000Z' }];
  assert.deepEqual(onOrBefore(records, '2026-11-02'), [records[0]]);
  assert.deepEqual(onOrBefore(records, '2026-11-14'), records);
  assert.equal(records.length, 2);
  assert.deepEqual(onOrBefore(records, null), records);
});
