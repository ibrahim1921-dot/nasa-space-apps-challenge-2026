import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const example = JSON.parse(readFileSync(new URL('../../../examples/export-page.json', import.meta.url), 'utf8'));
const CAPTURE = '10000000-0000-4000-8000-000000000001', ACCOUNT = '10000000-0000-4000-8000-000000000003';
const OTHER = '10000000-0000-4000-8000-000000000004';
const BACKEND = 'http://127.0.0.1:18080';

async function mockContract(page, { reject = 0, waitForAck } = {}) {
  const posts = [], pythonCookies = [], errors = []; let token = 'csrf-browser-contract-000000000001';
  const cors = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5173', 'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-TOKEN', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  const account = { accountId: ACCOUNT, role: 'NASA_OFFICER', loginName: 'contract.officer' };
  const capture = { captureId: CAPTURE, workspaceId: example.workspace_id, runId: example.items[0].envelope.observation.simulation_metadata.run_id,
    createdByAccountId: ACCOUNT, status: 'ACTIVE', mappings: [{ mappingId: OTHER, simulationAstronautId: example.items[0].envelope.observation.astronaut_id,
      simulationCrewCode: example.items[0].envelope.crew_code, astronautId: ACCOUNT, targetCrewCode: 'crew-01' }] };
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.port === '5173' && url.pathname.startsWith('/api/')) pythonCookies.push(request.headers().cookie);
  });
  await page.route(`${BACKEND}/**`, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const reply = (data, status = 200, extra = {}) => route.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...extra }, body: JSON.stringify(data) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (path === '/api/auth/csrf') return reply({ headerName: 'X-CSRF-TOKEN', token });
    if (path === '/api/auth/login') {
      expect(request.headers()['x-csrf-token']).toBe(token);
      expect(request.postDataJSON()).toEqual({ loginName: 'contract.officer', password: 'ephemeral-contract-test' });
      token = 'rotated-csrf-browser-contract-0002';
      return reply(account, 200, { 'Set-Cookie': 'JSESSIONID=contract-test-only; Path=/; HttpOnly; SameSite=Lax' });
    }
    if (path === '/api/auth/me') return reply(account);
    if (path === `/api/simulation/captures/${CAPTURE}`) return reply(capture);
    if (path.endsWith('/observations')) {
      expect(request.headers()['x-csrf-token']).toBe(token); posts.push(request.postDataJSON());
      if (reject) return reply({ error: reject === 422 ? 'missing_scope' : 'receipt_conflict' }, reject);
      if (waitForAck) await waitForAck;
      return reply({ captureId: CAPTURE, created: 1, duplicates: 0,
        results: [{ sequence: 1, sourceRecordId: example.items[0].envelope.observation.source_record_id, observationId: OTHER, duplicate: false }] });
    }
    return reply({ error: 'unexpected mock backend route' }, 404);
  });
  await page.route('**/api/state?run_id=*', async route => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ workspace_id: example.workspace_id,
      selected_run_id: capture.runId, astronaut_id: capture.mappings[0].simulationAstronautId, runs: [{ run_id: capture.runId }] }) });
  });
  await page.route('**/api/v1/observations?*', async route => {
    const query = new URL(route.request().url()).searchParams, after = Number(query.get('after'));
    const through = query.has('through') ? Number(query.get('through')) : 1;
    const url = position => `/api/v1/observations?workspace_id=${example.workspace_id}&after=${position}&limit=100`;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...example, after, through, last_sequence: through,
      items: after === 0 && through > 0 ? example.items : [], retained_observations: 1, next_url: null, checkpoint_url: url(through) }) });
  });
  return { posts, pythonCookies, errors };
}

test('officer explicitly signs in, verifies and approves one snapshot; reload preserves checkpoint without auto-delivery', async ({ page }) => {
  const contract = await mockContract(page); await page.goto('/');
  await page.getByLabel('Officer login', { exact: true }).fill('contract.officer');
  await page.getByLabel('Officer password', { exact: true }).fill('ephemeral-contract-test');
  await page.getByRole('button', { name: 'Sign in to Spring Boot' }).click();
  await expect(page.getByTestId('delivery-status')).toHaveText('Officer session verified');
  expect((await page.context().cookies(BACKEND)).some(cookie => cookie.name === 'JSESSIONID' && cookie.httpOnly)).toBe(true);
  await expect(page.getByLabel('Officer password', { exact: true })).toHaveValue('');
  await page.getByLabel('Existing capture UUID').fill(CAPTURE);
  await page.getByRole('button', { name: 'Verify session and capture' }).click();
  await expect(page.getByTestId('delivery-status')).toContainText('explicit delivery approval required');
  const send = page.getByRole('button', { name: 'Deliver one frozen snapshot' }); await expect(send).toBeDisabled(); expect(contract.posts).toHaveLength(0);
  await page.getByRole('checkbox', { name: /I authorize this browser/ }).check(); await send.click();
  await expect(page.getByTestId('delivery-status')).toContainText('Snapshot scan complete'); expect(contract.posts).toHaveLength(1);
  expect(contract.posts[0].items[0].envelope).toEqual(example.items[0].envelope);
  await page.reload(); expect(contract.posts).toHaveLength(1);
  await page.getByLabel('Existing capture UUID').fill(CAPTURE); await page.getByRole('button', { name: 'Verify session and capture' }).click();
  await expect(page.getByText('Last confirmed export sequence:', { exact: false })).toContainText('1');
  await expect(page.getByRole('checkbox', { name: /I authorize this browser/ })).not.toBeChecked();
  const storage = await page.evaluate(() => Object.values(localStorage).join(''));
  expect(storage).not.toContain('ephemeral-contract-test'); expect(storage).not.toContain('csrf-browser'); expect(storage).not.toContain('JSESSIONID');
  expect(contract.pythonCookies.every(cookie => !cookie)).toBe(true); expect(contract.errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('missing scope stops visibly, retains pending originals and does not retry on reload', async ({ page }) => {
  const contract = await mockContract(page, { reject: 422 }); await page.goto('/');
  await page.getByLabel('Existing capture UUID').fill(CAPTURE); await page.getByRole('button', { name: 'Verify session and capture' }).click();
  await expect(page.getByRole('checkbox', { name: /I authorize this browser/ })).toBeEnabled();
  await page.getByRole('checkbox', { name: /I authorize this browser/ }).check(); await page.getByRole('button', { name: 'Deliver one frozen snapshot' }).click();
  await expect(page.getByRole('alert')).toContainText('approved comparison scope is missing'); expect(contract.posts).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Retry pending snapshot unchanged' })).toBeVisible();
  await page.reload(); expect(contract.posts).toHaveLength(1); expect(contract.errors).toEqual([]);
});

test('real browser Web Locks exclude a competing tab and the stale tab reloads the confirmed cursor', async ({ page, context }) => {
  let release;
  const waitForAck = new Promise(resolve => { release = resolve; });
  const first = await mockContract(page, { waitForAck });
  const other = await context.newPage(); const second = await mockContract(other);
  try {
    for (const tab of [page, other]) {
      await tab.goto('/'); await tab.getByLabel('Existing capture UUID').fill(CAPTURE);
      await tab.getByRole('button', { name: 'Verify session and capture' }).click();
      await expect(tab.getByRole('checkbox', { name: /I authorize this browser/ })).toBeEnabled();
      await tab.getByRole('checkbox', { name: /I authorize this browser/ }).check();
    }
    await page.getByRole('button', { name: 'Deliver one frozen snapshot' }).click();
    await expect.poll(() => first.posts.length).toBe(1);
    await other.getByRole('button', { name: 'Deliver one frozen snapshot' }).click();
    await expect(other.getByRole('alert')).toContainText('Another tab'); expect(second.posts).toHaveLength(0);
    release(); await expect(page.getByTestId('delivery-status')).toContainText('Snapshot scan complete');
    await other.getByRole('button', { name: 'Deliver one frozen snapshot' }).click();
    await expect(other.getByTestId('delivery-status')).toContainText('Snapshot scan complete'); expect(second.posts).toHaveLength(0);
    expect(first.errors).toEqual([]); expect(second.errors).toEqual([]);
  } finally { release(); await other.close(); }
});
