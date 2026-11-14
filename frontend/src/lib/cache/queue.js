import { readStorage, writeStorage } from './index';
import { copy } from '@/content/ui';
import { request, ApiError, useMocks } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import { markRoutine } from '@/features/routine/storage';
const key = `chm:pending:${useMocks ? 'mock' : 'real'}`;
export function pendingCheckins() { return readStorage(key, []); }
export function enqueue(crewId, payload, id = crypto.randomUUID()) {
  const entry = { id, crewId, payload, status: 'pending' };
  if (!writeStorage(key, [...pendingCheckins(), entry])) throw new Error(copy.shared.storage_error);
  return entry;
}
let sending = false;
export async function flushQueue(send = request) {
  if (sending) return;
  sending = true;
  try {
    for (const entry of pendingCheckins()) {
      if (entry.status === 'rejected') continue;
      try {
        await send(endpoints.checkins(entry.crewId), { method: 'POST', body: JSON.stringify(entry.payload), headers: { 'Idempotency-Key': entry.id } });
        writeStorage(key, pendingCheckins().filter(item => item.id !== entry.id));
        markRoutine(entry.crewId, 'checkin', entry.payload.recordedAt);
      } catch (error) {
        if (error instanceof ApiError) writeStorage(key, pendingCheckins().map(item => item.id === entry.id ? { ...item, status: 'rejected', error: error.message } : item));
        else break;
      }
    }
  } finally { sending = false; }
}
