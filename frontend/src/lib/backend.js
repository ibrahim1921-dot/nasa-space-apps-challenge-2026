// Connection to the team's Java backend (docs/api-contract.md).
//
// NEXT_PUBLIC_USE_MOCKS=true (the default): the app runs on its own mock API (src/app/api) and the
// bundled data in src/data. Nothing needs the Java backend, so the demo always works.
// NEXT_PUBLIC_USE_MOCKS=false: crew, check-ins, nights, labs and radiation come from the backend at
// NEXT_PUBLIC_API_URL. Anything the contract does not cover yet stays on the mock API / device.

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== 'false';
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/$/, '');

export class BackendError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Call the Java backend. Throws BackendError for an HTTP error, a plain Error when unreachable. */
export async function backend(path, init = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      cache: 'no-store',
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error('Onboard server unreachable');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new BackendError(body?.error ?? `Onboard server answered ${response.status}`, response.status);
  return body;
}

/** Is the backend up? (GET /actuator/health) */
export async function backendHealthy() {
  if (USE_MOCKS) return false;
  try {
    const body = await backend('/actuator/health', { signal: AbortSignal.timeout(4000) });
    return body?.status === 'UP';
  } catch {
    return false;
  }
}
