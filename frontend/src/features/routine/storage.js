import { readStorage, writeStorage } from '@/lib/cache';
import { dayKey } from '@/lib/format';
export function routineDays(crewId) { return readStorage(`chm:routine:${crewId}`, []); }
export function markRoutine(crewId, kind, date = new Date()) {
  const days = routineDays(crewId); const day = dayKey(date);
  const entry = days.find(item => item.day === day);
  if (entry) entry[kind] = true; else days.push({ day, [kind]: true });
  writeStorage(`chm:routine:${crewId}`, days); return days;
}
export function streak(days, now = new Date()) {
  const completed = new Set(days.filter(d => d.checkin).map(d => d.day));
  const cursor = new Date(`${dayKey(now)}T12:00:00Z`);
  if (!completed.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let count = 0;
  while (completed.has(dayKey(cursor))) { count++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  return count;
}
