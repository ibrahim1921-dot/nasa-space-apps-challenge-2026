// Client for Augustine's Spring Boot backend (backend/, docs/authentication-phase2.md).
//
// - Base URL from NEXT_PUBLIC_API_URL (default http://localhost:8080, the backend's local port).
// - Session cookie (JSESSIONID, HttpOnly) travels with credentials: 'include'; this file never sees it.
// - CSRF: GET /api/auth/csrf returns { headerName, token }. The token is kept in memory only and sent in
//   that header on every unsafe request (POST/PUT/PATCH/DELETE), including login and logout. The backend
//   rotates it on login and clears it on logout, so it is fetched again after both.
// - Errors become ApiError with a `kind` the UI can switch on. The backend's error body is { error } with
//   a fixed safe message; it never names fields, so field messages come from the validators below.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/$/, '');

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TIMEOUT_MS = 10_000;

export const ERROR_TEXT = {
  unauthorized: 'Your session has ended. Please sign in again.',
  forbidden: 'You are not allowed to do this.',
  validation: 'Please check the highlighted fields.',
  not_found: 'Not found.',
  conflict: 'This changed in the meantime. Reload and try again.',
  rate_limited: 'Too many attempts. Try again later.',
  server: 'Server problem, try again.',
  unreachable: 'Backend not reachable.',
};

export class ApiError extends Error {
  /**
   * @param {'unauthorized'|'forbidden'|'validation'|'not_found'|'conflict'|'rate_limited'|'server'|'unreachable'} kind
   * @param {string} message  safe text to show
   * @param {number|null} status
   * @param {{ serverMessage?: string|null, fields?: Record<string,string>|null, retryAfter?: number|null }} [extra]
   */
  constructor(kind, message, status = null, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.serverMessage = extra.serverMessage ?? null;
    this.fields = extra.fields ?? null;
    this.retryAfter = extra.retryAfter ?? null;
  }
}

export function kindForStatus(status) {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 400 || status === 422) return 'validation';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  return 'server';
}

/** Query string from an object, skipping null/undefined/'' values. */
export function toQuery(params = {}) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function readBody(response) {
  if (response.status === 204) return null;
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {{ baseUrl?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createApiClient({ baseUrl = API_URL, fetchImpl, timeoutMs = TIMEOUT_MS } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  let csrf = null; // { headerName, token } for the current session; memory only
  let onUnauthorized = null;

  async function send(method, path, { body, query, signal } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (UNSAFE.has(method)) {
      const t = await csrfToken();
      headers[t.headerName] = t.token;
    }
    let response;
    try {
      response = await doFetch(`${baseUrl}${path}${toQuery(query)}`, {
        method,
        credentials: 'include',
        cache: 'no-store',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ?? (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined),
      });
    } catch (err) {
      if (err?.name === 'AbortError' && signal?.aborted) throw err; // caller cancelled
      throw new ApiError('unreachable', ERROR_TEXT.unreachable);
    }
    return { response, data: await readBody(response) };
  }

  async function csrfToken(force = false) {
    if (csrf && !force) return csrf;
    const { response, data } = await send('GET', '/api/auth/csrf');
    if (!response.ok || !data?.headerName || !data?.token) {
      throw new ApiError(response.status >= 500 ? 'server' : 'unreachable', response.status >= 500 ? ERROR_TEXT.server : ERROR_TEXT.unreachable, response.status);
    }
    csrf = { headerName: data.headerName, token: data.token };
    return csrf;
  }

  function toError(response, data) {
    const kind = kindForStatus(response.status);
    const serverMessage = typeof data?.error === 'string' ? data.error : null;
    // 400/404/409 messages from the backend are fixed, safe texts written for people; show them.
    const message = ['validation', 'not_found', 'conflict'].includes(kind) && serverMessage ? serverMessage : ERROR_TEXT[kind];
    const retry = Number(response.headers?.get?.('Retry-After'));
    return new ApiError(kind, message, response.status, { serverMessage, retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null });
  }

  /**
   * One request. `auth: false` marks the login call, whose 401 means "wrong login", not "session over".
   * An unsafe request refused with 403 is retried once with a fresh CSRF token (the token may have been
   * rotated by a login in another tab or cleared by a server restart).
   */
  async function request(method, path, { body, query, signal, auth = true } = {}) {
    let { response, data } = await send(method, path, { body, query, signal });
    if (response.status === 403 && UNSAFE.has(method)) {
      csrf = null;
      ({ response, data } = await send(method, path, { body, query, signal }));
    }
    if (response.ok) return data;
    const error = toError(response, data);
    if (error.kind === 'unauthorized' && auth) {
      csrf = null;
      onUnauthorized?.(error);
    }
    throw error;
  }

  return {
    baseUrl,
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    request,
    csrfToken,
    /** Called with the ApiError whenever an authenticated request gets 401. */
    setUnauthorizedHandler(fn) {
      onUnauthorized = fn;
    },
    /** For tests and sign-out: forget the in-memory CSRF token. */
    resetCsrf() {
      csrf = null;
    },

    // ---- Auth (docs/authentication-phase2.md) ----
    /** Is the backend there at all? Uses the public CSRF route; never throws. */
    async ping() {
      try {
        await csrfToken(true);
        return true;
      } catch {
        return false;
      }
    },
    /** POST /api/auth/login { loginName, password } → AccountIdentity. Fresh CSRF token afterwards. */
    async login(loginName, password) {
      await csrfToken(true);
      try {
        return await request('POST', '/api/auth/login', { body: { loginName, password }, auth: false });
      } catch (err) {
        if (err instanceof ApiError && err.kind === 'unauthorized') {
          throw new ApiError('unauthorized', 'Login name or password not recognised.', 401, { serverMessage: err.serverMessage });
        }
        throw err;
      } finally {
        csrf = null; // the backend rotated it; the next unsafe call fetches the new one
      }
    },
    /** GET /api/auth/me → AccountIdentity; 401 when there is no session (not reported to the 401 handler). */
    me: () => request('GET', '/api/auth/me', { auth: false }),
    /** POST /api/auth/logout → 204. Always forgets the token, even when the call fails. */
    async logout() {
      try {
        await request('POST', '/api/auth/logout', { auth: false });
      } finally {
        csrf = null;
      }
    },
  };
}

/** The app's shared client. */
export const api = createApiClient();

// ---- Client-side validation (the backend's 400s carry no field names) ----

const LOGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const utf8Bytes = (s) => new TextEncoder().encode(s).length;

/** Mirrors LoginRequest: loginName 3–64 chars [A-Za-z0-9._-] starting alphanumeric; password nonblank, ≤ 72 UTF-8 bytes. */
export function validateLogin({ loginName = '', password = '' }) {
  const fields = {};
  const name = loginName.trim();
  if (!name) fields.loginName = 'Enter your login name.';
  else if (!LOGIN_NAME.test(name)) fields.loginName = 'Login names are 3–64 letters, digits, dots, dashes or underscores.';
  if (!password.trim()) fields.password = 'Enter your password.';
  else if (utf8Bytes(password) > 72) fields.password = 'Password is too long (max 72 bytes).';
  return fields;
}

export const NOTE_MAX = 2000;

/** Mirrors the resolve/approve note rules: required, nonblank, at most 2000 characters. */
export function validateNote(note = '') {
  if (!note.trim()) return 'A note is required.';
  if (note.length > NOTE_MAX) return `Keep the note to ${NOTE_MAX} characters or fewer.`;
  return null;
}
