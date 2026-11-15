// API client against a fake fetch that follows the documented backend contract. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApiClient, kindForStatus, toQuery, validateLogin, validateNote } from './api.js';

const json = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k] ?? null },
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
});

/** Fake backend: issues CSRF tokens, rotates them on login, and records each call. */
function fakeBackend(routes = {}) {
  const calls = [];
  let n = 0;
  let token = null;
  const fetchImpl = async (url, init) => {
    const path = url.replace('http://api.test', '');
    calls.push({ path, init });
    if (path === '/api/auth/csrf') {
      token = token ?? `t${++n}`;
      return json(200, { headerName: 'X-CSRF-TOKEN', token });
    }
    if (init.method === 'POST' && init.headers['X-CSRF-TOKEN'] !== token) return json(403, { error: 'Access denied.' });
    const handler = routes[`${init.method} ${path.split('?')[0]}`];
    if (!handler) return json(404, { error: 'Not found' });
    const out = await handler({ path, init });
    if (path === '/api/auth/login' && out.status === 200) token = null; // rotated by the backend
    if (path === '/api/auth/logout') token = null;
    return out;
  };
  return { calls, fetchImpl };
}

const IDENTITY = { accountId: 'a-1', loginName: 'maya.demo', role: 'ASTRONAUT', profile: { astronautId: 'u-1', crewCode: 'crew-01', displayName: 'Maya Okafor' } };

test('every request sends credentials: include and no-store', async () => {
  const be = fakeBackend({ 'GET /api/auth/me': () => json(200, IDENTITY) });
  const api = createApiClient({ baseUrl: 'http://api.test', fetchImpl: be.fetchImpl });
  assert.deepEqual(await api.me(), IDENTITY);
  assert.equal(be.calls[0].init.credentials, 'include');
  assert.equal(be.calls[0].init.cache, 'no-store');
});

test('login fetches a CSRF token first, sends it, and fetches a fresh one for the next POST', async () => {
  const be = fakeBackend({
    'POST /api/auth/login': ({ init }) => {
      assert.deepEqual(JSON.parse(init.body), { loginName: 'maya.demo', password: 'x'.repeat(15) });
      return json(200, IDENTITY);
    },
    'POST /api/alerts/al-1/acknowledge': () => json(200, { alert: { id: 'al-1', status: 'ACKNOWLEDGED' } }),
  });
  const api = createApiClient({ baseUrl: 'http://api.test', fetchImpl: be.fetchImpl });
  await api.login('maya.demo', 'x'.repeat(15));
  const login = be.calls.find((c) => c.path === '/api/auth/login');
  assert.equal(login.init.headers['X-CSRF-TOKEN'], 't1');
  await api.post('/api/alerts/al-1/acknowledge');
  const ack = be.calls.find((c) => c.path.endsWith('/acknowledge'));
  assert.equal(ack.init.headers['X-CSRF-TOKEN'], 't2', 'token re-fetched after login rotation');
  assert.equal(ack.init.body, undefined, 'acknowledge has no body');
});

test('GET requests carry no CSRF header', async () => {
  const be = fakeBackend({ 'GET /api/crew': () => json(200, []) });
  const api = createApiClient({ baseUrl: 'http://api.test', fetchImpl: be.fetchImpl });
  await api.get('/api/crew');
  assert.equal(be.calls.length, 1);
  assert.equal(be.calls[0].init.headers['X-CSRF-TOKEN'], undefined);
});

test('a 403 on a POST is retried once with a fresh token', async () => {
  let tries = 0;
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    if (url.endsWith('/api/auth/csrf')) return json(200, { headerName: 'X-CSRF-TOKEN', token: `t${calls.length}` });
    tries += 1;
    return tries === 1 ? json(403, { error: 'Access denied.' }) : json(200, { ok: true });
  };
  const api = createApiClient({ baseUrl: 'http://api.test', fetchImpl });
  assert.deepEqual(await api.post('/api/x', {}), { ok: true });
  assert.equal(calls.filter((u) => u.endsWith('/csrf')).length, 2);
});

test('a persistent 403 becomes a "not allowed" error', async () => {
  const fetchImpl = async (url) => (url.endsWith('/csrf') ? json(200, { headerName: 'X-CSRF-TOKEN', token: 't' }) : json(403, { error: 'Access denied.' }));
  const api = createApiClient({ baseUrl: 'http://api.test', fetchImpl });
  await assert.rejects(api.post('/api/alerts/1/resolve', { note: 'x' }), (e) => e instanceof ApiError && e.kind === 'forbidden' && /not allowed/.test(e.message));
});

test('401 on an authenticated call calls the unauthorized handler; on login it means wrong credentials', async () => {
  const be = fakeBackend({
    'GET /api/alerts/me': () => json(401, { error: 'Authentication required.' }),
    'POST /api/auth/login': () => json(401, { error: 'Invalid login credentials.' }),
  });
  const api = createApiClient({ baseUrl: 'http://api.test', fetchImpl: be.fetchImpl });
  let seen = 0;
  api.setUnauthorizedHandler(() => (seen += 1));
  await assert.rejects(api.get('/api/alerts/me'), (e) => e.kind === 'unauthorized');
  assert.equal(seen, 1);
  await assert.rejects(api.login('maya.demo', 'wrong-password-123'), (e) => e.kind === 'unauthorized' && /not recognised/.test(e.message));
  assert.equal(seen, 1, 'a failed login is not a session expiry');
});

test('400 and 409 show the backend safe message; 5xx says server problem; 429 keeps Retry-After', async () => {
  const be = fakeBackend({
    'GET /api/alerts': () => json(400, { error: 'Invalid alert filter, pagination, time range or resolution note.' }),
    'POST /api/alerts/1/resolve': () => json(409, { error: 'Resolved alerts cannot be acknowledged again.' }),
    'GET /api/crew': () => json(503, { error: 'Authentication temporarily unavailable.' }),
    'POST /api/auth/login': () => json(429, { error: 'Too many attempts. Try again later.' }, { 'Retry-After': '900' }),
  });
  const api = createApiClient({ baseUrl: 'http://api.test', fetchImpl: be.fetchImpl });
  await assert.rejects(api.get('/api/alerts'), (e) => e.kind === 'validation' && /Invalid alert filter/.test(e.message));
  await assert.rejects(api.post('/api/alerts/1/resolve', { note: 'n' }), (e) => e.kind === 'conflict' && /cannot be acknowledged/.test(e.message));
  await assert.rejects(api.get('/api/crew'), (e) => e.kind === 'server' && e.message === 'Server problem, try again.');
  await assert.rejects(api.login('maya.demo', 'x'.repeat(15)), (e) => e.kind === 'rate_limited' && e.retryAfter === 900);
});

test('network failure is "Backend not reachable"; ping reports false', async () => {
  const api = createApiClient({ baseUrl: 'http://api.test', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(api.me(), (e) => e.kind === 'unreachable' && e.message === 'Backend not reachable.');
  assert.equal(await api.ping(), false);
});

test('logout sends the token, then forgets it', async () => {
  const be = fakeBackend({ 'POST /api/auth/logout': () => json(204) });
  const api = createApiClient({ baseUrl: 'http://api.test', fetchImpl: be.fetchImpl });
  await api.logout();
  const out = be.calls.find((c) => c.path === '/api/auth/logout');
  assert.ok(out.init.headers['X-CSRF-TOKEN']);
  await api.logout();
  assert.equal(be.calls.filter((c) => c.path === '/api/auth/csrf').length, 2, 'token fetched again after logout');
});

test('kindForStatus and toQuery', () => {
  assert.deepEqual([401, 403, 400, 404, 409, 429, 500, 503].map(kindForStatus), ['unauthorized', 'forbidden', 'validation', 'not_found', 'conflict', 'rate_limited', 'server', 'server']);
  assert.equal(toQuery({ page: 0, size: 20, status: '', indicator: null, from: '2026-01-01T00:00:00Z' }), '?page=0&size=20&from=2026-01-01T00%3A00%3A00Z');
  assert.equal(toQuery({}), '');
});

test('validateLogin mirrors LoginRequest', () => {
  assert.deepEqual(validateLogin({ loginName: 'maya.demo', password: 'p' }), {});
  assert.ok(validateLogin({ loginName: '', password: '' }).loginName);
  assert.ok(validateLogin({ loginName: 'ab', password: 'p' }).loginName);
  assert.ok(validateLogin({ loginName: '.maya', password: 'p' }).loginName);
  assert.ok(validateLogin({ loginName: 'maya.demo', password: '   ' }).password);
  assert.ok(validateLogin({ loginName: 'maya.demo', password: 'é'.repeat(37) }).password, '74 bytes');
});

test('validateNote: required, nonblank, max 2000', () => {
  assert.ok(validateNote(''));
  assert.ok(validateNote('   '));
  assert.equal(validateNote('Reviewed.'), null);
  assert.equal(validateNote('x'.repeat(2000)), null);
  assert.ok(validateNote('x'.repeat(2001)));
});
