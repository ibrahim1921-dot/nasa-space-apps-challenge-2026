import { cacheGet, cachePut } from '@/lib/cache';
import { copy } from '@/content/ui';
import { mockRequest } from './mock';
export const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
export class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
export async function request(path, options = {}) {
  const { transport, ...init } = options;
  const get = !init.method || init.method === 'GET';
  const scopedPath = `${useMocks ? 'mock' : 'real'}:${path}`;
  try {
    let data;
    if (useMocks && !transport) data = await mockRequest(path, init);
    else {
      const response = await (transport || fetch)(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers }, signal: init.signal || AbortSignal.timeout(8000) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(body.error || copy.shared.server_error, response.status);
      data = body;
    }
    const saved = get ? cachePut(scopedPath, data) : null;
    return { data, offline: false, timestamp: saved?.timestamp };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const cached = get && cacheGet(scopedPath);
    if (cached) return { ...cached, offline: true };
    throw new Error(copy.shared.unreachable);
  }
}
