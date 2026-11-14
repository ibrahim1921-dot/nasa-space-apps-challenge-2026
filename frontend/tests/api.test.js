import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request, ApiError } from '@/lib/api/client';
import { cacheGet } from '@/lib/cache';
import { mockRequest, crew } from '@/lib/api/mock';
import { endpoints } from '@/lib/api/endpoints';
import { indicatorIds } from '@/content/indicators';
const sample = name => JSON.parse(readFileSync(resolve(process.cwd(), '../docs/samples', `${name}.json`), 'utf8'));
function shape(actual, expected) {
  if (expected === null) { expect(actual).toBeNull(); return; }
  if (Array.isArray(expected)) { expect(Array.isArray(actual)).toBe(true); expected.forEach((value, i) => shape(value?.id ? actual.find(item => item.id === value.id) : actual[i], value)); return; }
  if (typeof expected === 'object') { for (const [key, value] of Object.entries(expected)) { expect(actual).toHaveProperty(key); shape(actual[key], value); } return; }
  expect(typeof actual).toBe(typeof expected);
}
describe('API client', () => {
  it('caches a successful GET then falls back with the original timestamp', async () => {
    const transport = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ readings: [64] }) }).mockRejectedValueOnce(new TypeError('offline'));
    const online = await request('/test', { transport }); const offline = await request('/test', { transport });
    expect(offline).toEqual({ data: online.data, timestamp: online.timestamp, offline: true });
    expect(cacheGet('real:/test').data).toEqual({ readings: [64] });
  });
  it('does not hide API validation errors behind cached results', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Check the mood value', field: 'mood' }) });
    await expect(request('/bad', { transport })).rejects.toThrow('Check the mood value');
    await expect(request('/bad', { transport })).rejects.toBeInstanceOf(ApiError);
  });
  it('reports unavailable when there is no cached result', async () => {
    await expect(request('/new', { transport: async () => { throw new TypeError('offline'); } })).rejects.toThrow('No saved results');
  });
  it('never caches check-in POST responses', async () => {
    await request('/post', { method: 'POST', transport: async () => ({ ok: true, json: async () => ({ ok: true }) }) });
    expect(cacheGet('real:/post')).toBeNull();
  });
});
describe('synthetic contract fixtures', () => {
  it('matches the supplied summary and check-in sample shapes', async () => {
    shape(await mockRequest(endpoints.summary(crew[0].id)), sample('summary-response'));
    shape(await mockRequest(endpoints.checkins(crew[0].id), { method: 'POST', body: JSON.stringify(sample('checkin-request')) }), sample('checkin-response'));
  });
  it('provides 14 days for every indicator of three fictional crew and all four statuses', async () => {
    expect(await mockRequest(endpoints.crew)).toHaveLength(3); const states = new Set();
    for (const person of crew) {
      const summary = await mockRequest(endpoints.summary(person.id));
      expect(summary.indicators.find(item => item.id === 'blood_pressure').value).toEqual({ systolic: 118, diastolic: 76 });
      summary.indicators.forEach(item => states.add(item.status));
      for (const id of indicatorIds) { const response = await mockRequest(endpoints.readings(person.id,id)); expect(response.readings).toHaveLength(14); expect(response.source).toBe('synthetic'); }
    }
    expect([...states].sort()).toEqual(['alert','no_data','normal','watch']);
  });
  it('implements the remaining GET endpoints with source provenance', async () => {
    expect(await mockRequest(endpoints.health)).toEqual({ status: 'UP' });
    expect((await mockRequest(endpoints.nights('demo-01'))).nights.length).toBeGreaterThan(0);
    expect((await mockRequest(endpoints.labs('GLUCOSE'))).draws).toHaveLength(7);
    expect((await mockRequest(endpoints.radiation)).days).toHaveLength(14);
  });
});
