import { describe, it, expect, vi } from 'vitest';
import { streak, markRoutine, routineDays } from '@/features/routine/storage';
import { enqueue, pendingCheckins, flushQueue } from '@/lib/cache/queue';
import { ApiError } from '@/lib/api/client';
const payload = { recordedAt: '2026-11-14T08:00:00Z', readings: { mood: 4 } };
describe('routine streak', () => {
  it('counts consecutive UTC days and ignores duplicate check-ins and sleep logs', () => {
    markRoutine('crew-01','checkin','2026-11-14T08:00:00Z'); markRoutine('crew-01','checkin','2026-11-14T20:00:00Z'); markRoutine('crew-01','checkin','2026-11-13T08:00:00Z'); markRoutine('crew-01','sleep','2026-11-12T08:00:00Z');
    expect(streak(routineDays('crew-01'),'2026-11-14')).toBe(2); expect(routineDays('crew-01')).toHaveLength(3); expect(routineDays('crew-02')).toEqual([]);
  });
  it('retains yesterday’s streak until today ends and resets after a missed day', () => {
    const days = [{ day: '2026-11-13', checkin: true }]; expect(streak(days,'2026-11-14')).toBe(1); expect(streak(days,'2026-11-15')).toBe(0);
  });
});
describe('offline queue', () => {
  it('persists pending work, retains failed sends, then removes only successful work', async () => {
    enqueue('crew-01',payload,'stable-key');
    expect(JSON.parse(localStorage.getItem('chm:pending:real'))[0].id).toBe('stable-key');
    expect(localStorage.getItem('chm:pending:mock')).toBeNull();
    await flushQueue(async () => { throw new TypeError('offline'); });
    expect(pendingCheckins()[0].status).toBe('pending');
    const send = vi.fn().mockResolvedValue({ data: {} }); await flushQueue(send);
    expect(send.mock.calls[0][1].headers['Idempotency-Key']).toBe('stable-key'); expect(pendingCheckins()).toEqual([]); expect(routineDays('crew-01')[0].checkin).toBe(true);
  });
  it('retains server rejections with their messages and does not retry them', async () => {
    enqueue('crew-01',payload); const send = vi.fn().mockRejectedValue(new ApiError('Invalid reading',400));
    await flushQueue(send); await flushQueue(send); expect(send).toHaveBeenCalledTimes(1); expect(pendingCheckins()[0]).toMatchObject({ status: 'rejected', error: 'Invalid reading' });
  });
  it('prevents simultaneous retry loops from submitting the same record', async () => {
    enqueue('crew-01',payload); let finish; const send = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const first = flushQueue(send); await flushQueue(send); expect(send).toHaveBeenCalledTimes(1); finish({ data: {} }); await first;
  });
});
