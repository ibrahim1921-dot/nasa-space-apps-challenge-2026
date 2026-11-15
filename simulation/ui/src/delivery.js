import { DeliveryError, fail, UUID, MAX_EXPORT, parseOriginalJson, planPage, exportUrl, checkedExportUrl } from './delivery-export.js';

export function checkedBackendOrigin(value, labOrigin, pythonPort = 8765) {
  let url;
  try { url = new URL(value); } catch { fail('configuration', 'Configure an explicit loopback Spring Boot origin before enabling delivery.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port === '8765'
      || Number(url.port || (url.protocol === 'https:' ? 443 : 80)) === Number(pythonPort)) {
    fail('configuration', 'Spring Boot must use an explicit loopback HTTP(S) origin, without credentials, paths or options, separate from Python.');
  }
  if (labOrigin) {
    const lab = new URL(labOrigin);
    if (url.origin === lab.origin || url.hostname !== lab.hostname || url.protocol !== lab.protocol) {
      fail('configuration', 'Use a separate Spring Boot port with the same hostname and scheme as the Lab. SameSite cookies cannot be worked around by this panel.');
    }
  }
  return url.origin;
}

function backendFailure(status, code) {
  const messages = {
    401: 'Officer session expired or is missing. Sign in again, verify the same capture, then retry the pending records.',
    403: 'Access denied: check officer role, CSRF, exact Lab CORS origin, and the backend demo flag. Nothing will be bypassed.',
    404: 'Capture is missing or inaccessible to this officer. Use an existing capture owned by this session.',
    409: 'Capture/payload conflict, closed capture, archived destination or radiation ordering conflict. Stop and review the capture and receipts; do not change the pending payload.',
    422: 'An approved comparison scope is missing. Ask an administrator to run the controlled scope provisioning command for this capture.',
    413: 'Backend rejected the payload size. Pending originals are retained; no chart projection or truncated record will be sent.',
    400: 'Backend rejected the original envelope or mapping contract. Stop and review the capture/export; pending records were not changed.',
  };
  return new DeliveryError(code || 'backend_error', messages[status] || 'Spring Boot is unavailable. The batch may have committed; retry unchanged originals after checking the service.', status);
}

export function captureBinding(origin, account, capture) {
  if (!UUID.test(account?.accountId || '') || account.role !== 'NASA_OFFICER') fail('officer_required', 'An authenticated NASA_OFFICER session is required.');
  if (!UUID.test(capture?.captureId || '') || !UUID.test(capture.workspaceId || '') || !UUID.test(capture.runId || '')
      || capture.createdByAccountId !== account.accountId) fail('capture_identity', 'Capture identity or creator does not match the authenticated officer.');
  if (capture.status !== 'ACTIVE') fail('capture_closed', 'Delivery requires an existing ACTIVE capture. Closed or draft captures will not receive submissions.');
  if (!Array.isArray(capture.mappings) || !capture.mappings.length || capture.mappings.length > 4) fail('mapping_mismatch', 'Capture has no compatible approved mappings.');
  const sources = new Set(), codes = new Set(), targets = new Set(), targetCodes = new Set(), mappingIds = new Set();
  const mappings = capture.mappings.map(m => {
    if (!m || !UUID.test(m.mappingId || '') || !UUID.test(m.simulationAstronautId || '') || !UUID.test(m.astronautId || '')
        || typeof m.simulationCrewCode !== 'string' || !m.simulationCrewCode
        || !['crew-01', 'crew-02', 'crew-03', 'crew-04'].includes(m.targetCrewCode)
        || sources.has(m.simulationAstronautId) || codes.has(m.simulationCrewCode) || targets.has(m.astronautId)
        || targetCodes.has(m.targetCrewCode) || mappingIds.has(m.mappingId)) fail('mapping_mismatch', 'Capture mappings are missing, duplicated or unapproved.');
    sources.add(m.simulationAstronautId); codes.add(m.simulationCrewCode); targets.add(m.astronautId);
    targetCodes.add(m.targetCrewCode); mappingIds.add(m.mappingId);
    return { mappingId: m.mappingId, simulationAstronautId: m.simulationAstronautId, simulationCrewCode: m.simulationCrewCode,
      astronautId: m.astronautId, targetCrewCode: m.targetCrewCode };
  }).sort((a, b) => a.mappingId.localeCompare(b.mappingId));
  return { origin, accountId: account.accountId, captureId: capture.captureId, workspaceId: capture.workspaceId, runId: capture.runId, mappings };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copy = value => JSON.parse(JSON.stringify(value));

export class DeliveryClient {
  constructor({ enabled = false, backendOrigin, labOrigin = globalThis.location?.origin, pythonPort = 8765, fetchImpl = globalThis.fetch?.bind(globalThis),
    storage = globalThis.localStorage, locks = globalThis.navigator?.locks, onChange = () => {} } = {}) {
    this.enabled = enabled; this.origin = enabled ? checkedBackendOrigin(backendOrigin, labOrigin, pythonPort) : null;
    this.fetch = fetchImpl; this.storage = storage; this.locks = locks; this.onChange = onChange;
    this.state = null; this.running = false; this.csrf = null; this.status = 'Not authorized'; this.error = '';
  }
  needEnabled() { if (!this.enabled) fail('disabled', 'Delivery is disabled. Explicit build-time opt-in and operator authorization are required.'); }
  emit(status = this.status, error = '') { this.status = status; this.error = error; this.onChange(this.view()); }
  view() {
    if (!this.state) return { status: this.status, error: this.error, running: this.running };
    const { pending, ...metadata } = this.state;
    return { status: this.status, error: this.error, running: this.running, ...copy(metadata),
      pending: pending ? { batchIndex: pending.batchIndex } : null };
  }
  key(binding = this.state?.binding) { return `astrohealth.simulation.delivery.v1|${this.origin}|${binding.captureId}`; }
  save(next) {
    try { this.storage.setItem(this.key(next.binding), JSON.stringify(next)); }
    catch { fail('checkpoint_storage', 'Cannot save the durable local checkpoint/outbox. Delivery stopped; do not clear pending data. Retry after restoring browser storage.'); }
    this.state = next; this.emit();
  }

  async http(url, options, backend = true) {
    let response;
    try {
      const timeout = AbortSignal.timeout(45000);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      response = await this.fetch(url, { redirect: 'error', cache: 'no-store', ...options, signal });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new DeliveryError('connection', backend
        ? 'Browser could not reach Spring Boot. Check its exact CORS origin, cookie policy and availability. A pending batch may have committed; retry it unchanged.'
        : 'Python export is unavailable. Start/check the same local workspace; do not replace the checkpoint with another workspace.');
    }
    if (!response.ok) {
      if (!backend) throw new DeliveryError(response.status === 409 ? 'workspace_changed' : 'python_error',
        response.status === 409 ? 'Python workspace changed after restart. Stop: this capture and checkpoint belong to the previous workspace.'
          : response.status === 404 ? 'The registered Python run or source profile is unavailable. Stop and review the original capture; do not retarget its checkpoint.'
            : 'Python refused this export range. Stop and review retained workspace history.', response.status);
      let data;
      try { data = await response.json(); } catch { /* fixed public error only */ }
      if (response.status === 401 || response.status === 403) this.csrf = null;
      throw backendFailure(response.status, typeof data?.error === 'string' ? data.error : undefined);
    }
    return response;
  }
  async backend(path, { body, signal } = {}) {
    const headers = body === undefined ? {} : { 'Content-Type': 'application/json', [this.csrf.headerName]: this.csrf.token };
    const response = await this.http(`${this.origin}${path}`, { mode: 'cors', credentials: 'include', signal, headers,
      ...(body === undefined ? {} : { method: 'POST', body }) });
    try { return await response.json(); } catch { fail('backend_response', 'Spring Boot returned an unreadable response. The pending batch may have committed; retry unchanged.'); }
  }
  async refreshCsrf(signal) {
    const csrf = await this.backend('/api/auth/csrf', { signal });
    if (csrf?.headerName !== 'X-CSRF-TOKEN' || typeof csrf.token !== 'string' || csrf.token.length < 16 || csrf.token.length > 4096) fail('csrf_contract', 'The selected origin did not return the expected Spring Boot CSRF contract. No password or observation was sent.');
    this.csrf = csrf;
  }
  async signIn(loginName, password) {
    this.needEnabled();
    if (this.running) fail('worker_running', 'Stop the delivery worker before changing the session.');
    await this.refreshCsrf();
    await this.backend('/api/auth/login', { body: JSON.stringify({ loginName, password }) });
    await this.refreshCsrf(); // Login rotates session/CSRF state. Neither is persisted here.
    const account = await this.backend('/api/auth/me');
    if (account?.role !== 'NASA_OFFICER') fail('officer_required', 'This session is not a NASA_OFFICER. Delivery was not authorized.');
    this.emit('Officer session verified');
    return account;
  }
  async signOut() {
    this.needEnabled();
    if (this.running) fail('worker_running', 'Stop the delivery worker before ending the session.');
    await this.refreshCsrf();
    await this.http(`${this.origin}/api/auth/logout`, { mode: 'cors', credentials: 'include', method: 'POST',
      headers: { [this.csrf.headerName]: this.csrf.token } });
    this.csrf = null; this.state = null; this.emit('Browser session ended; saved checkpoints retained');
  }
  async freshBinding(id, signal) {
    const account = await this.backend('/api/auth/me', { signal });
    const capture = await this.backend(`/api/simulation/captures/${id}`, { signal });
    if (capture?.captureId !== id) fail('capture_identity', 'Backend returned a different capture. Delivery stopped.');
    return captureBinding(this.origin, account, capture);
  }
  async pythonText(path, signal) {
    const response = await this.http(path, { mode: 'same-origin', credentials: 'omit', signal }, false);
    if (Number(response.headers.get('Content-Length')) > MAX_EXPORT) fail('export_size', 'Python export exceeds the local page safety limit.');
    const reader = response.body?.getReader();
    if (!reader) fail('export_format', 'This browser cannot read bounded export responses.');
    const chunks = []; let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > MAX_EXPORT) fail('export_size', 'Python export exceeds the local page safety limit.');
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    const all = new Uint8Array(length); let offset = 0;
    chunks.forEach(chunk => { all.set(chunk, offset); offset += chunk.byteLength; });
    try { return new TextDecoder('utf-8', { fatal: true }).decode(all); }
    catch { fail('export_format', 'Python export is not valid UTF-8.'); }
  }
  async probe(binding, signal) {
    // State is consulted ONLY for identity/existence. All measurements still come
    // exclusively from complete export envelopes, never from these chart projections.
    const query = new URLSearchParams({ run_id: binding.runId, astronaut_id: binding.mappings[0].simulationAstronautId });
    const { value: identity } = parseOriginalJson(await this.pythonText(`/api/state?${query}`, signal));
    if (identity?.workspace_id !== binding.workspaceId) fail('workspace_changed', 'Python workspace changed. This capture/checkpoint cannot be attached to the new process.');
    if (identity.selected_run_id !== binding.runId || identity.astronaut_id !== binding.mappings[0].simulationAstronautId
        || !Array.isArray(identity.runs) || !identity.runs.some(run => run.run_id === binding.runId)) fail('run_mismatch', 'The registered run or source identity is not retained by this Python workspace.');
    const url = exportUrl(binding.workspaceId, 0, 0);
    const text = await this.pythonText(url, signal);
    planPage(text, url, binding); // Empty frozen snapshot verifies workspace without consuming history.
  }
  validateStored(state, binding) {
    if (state?.version !== 1 || !same(state.binding, binding) || !Number.isSafeInteger(state.confirmed?.sequence)
        || state.confirmed.sequence < 0 || state.confirmed.sequence > 50000
        || !['created', 'duplicates', 'excluded'].every(k => Number.isSafeInteger(state.counts?.[k]) && state.counts[k] >= 0)) fail('checkpoint_binding', 'Stored checkpoint is corrupt or belongs to a different capture, officer, run or mapping. It will not be silently reused.');
    checkedExportUrl(state.resumeUrl, binding.workspaceId);
    if (state.confirmed.url !== null) {
      const cursor = checkedExportUrl(state.confirmed.url, binding.workspaceId);
      if (cursor.after !== state.confirmed.sequence) fail('checkpoint_binding', 'Confirmed checkpoint position is inconsistent.');
    } else if (state.confirmed.sequence !== 0) fail('checkpoint_binding', 'Confirmed checkpoint evidence is missing.');
    if (state.pending) {
      if (state.pending.requestUrl !== state.resumeUrl) fail('checkpoint_binding', 'Pending page does not match its saved cursor.');
      const plan = planPage(state.pending.text, state.pending.requestUrl, binding);
      if (!Number.isSafeInteger(state.pending.batchIndex) || state.pending.batchIndex < 0 || state.pending.batchIndex > plan.batches.length) fail('checkpoint_binding', 'Pending batch index is invalid.');
      if (state.pending.batchIndex > 0 && state.confirmed.sequence !== plan.batches[state.pending.batchIndex - 1].items.at(-1).sequence) fail('checkpoint_binding', 'Pending acknowledgement does not match the saved page.');
    }
  }
  async connect(id) {
    this.needEnabled();
    if (this.running) fail('worker_running', 'Stop delivery before selecting another capture.');
    if (!UUID.test(id || '')) fail('capture_identity', 'Enter a registered capture UUID.');
    this.state = null;
    await this.refreshCsrf();
    const binding = await this.freshBinding(id);
    await this.probe(binding);
    if (!this.locks?.request) fail('locks_unavailable', 'This browser lacks Web Locks. Checkpoint initialization and delivery are disabled.');
    // Initialization is a checkpoint write too. Serialize it with workers in other
    // tabs so a suspended first-time verifier cannot overwrite newer progress.
    await this.locks.request(`astrohealth.simulation.delivery|${this.key(binding)}`, { mode: 'exclusive', ifAvailable: true }, lock => {
      if (!lock) fail('worker_locked', 'Another tab is delivering to this capture. Wait before verifying its checkpoint.');
      let raw;
      try { raw = this.storage.getItem(this.key(binding)); } catch { fail('checkpoint_storage', 'Browser checkpoint storage is unavailable; no delivery was started.'); }
      if (raw) {
        let stored;
        try { stored = JSON.parse(raw); } catch { fail('checkpoint_binding', 'Stored checkpoint is unreadable. It will not be overwritten.'); }
        this.validateStored(stored, binding); this.state = stored;
      } else this.save({ version: 1, binding, resumeUrl: exportUrl(binding.workspaceId), confirmed: { sequence: 0, url: null },
        counts: { created: 0, duplicates: 0, excluded: 0 }, pending: null });
    });
    this.emit(this.state.pending ? 'Ready: pending originals require an explicit retry' : 'Ready: explicit delivery approval required');
    return this.view();
  }
  validateAcknowledgement(result, batch) {
    if (result?.captureId !== this.state.binding.captureId || !Number.isSafeInteger(result.created) || !Number.isSafeInteger(result.duplicates)
        || result.created < 0 || result.duplicates < 0 || result.created + result.duplicates !== batch.items.length
        || !Array.isArray(result.results) || result.results.length !== batch.items.length) fail('backend_response', 'Backend acknowledgement is incomplete or belongs to another capture. Pending records are retained unchanged.');
    let duplicates = 0;
    batch.items.forEach((item, i) => {
      const row = result.results[i];
      if (!row || row.sequence !== item.sequence || row.sourceRecordId !== item.sourceRecordId || !UUID.test(row.observationId || '') || typeof row.duplicate !== 'boolean') fail('backend_response', 'Backend receipt identifiers do not match the submitted originals. Pending records are retained.');
      if (row.duplicate) duplicates++;
    });
    if (duplicates !== result.duplicates) fail('backend_response', 'Backend duplicate counts do not match its receipts.');
  }
  async deliver({ approved = false } = {}) {
    this.needEnabled();
    if (!approved || !this.state) fail('approval_required', 'Verify the capture and explicitly approve delivery first.');
    if (this.running) fail('worker_running', 'A delivery worker is already running for this panel.');
    if (!this.locks?.request) fail('locks_unavailable', 'This browser lacks Web Locks. Delivery is disabled to avoid concurrent capture workers.');
    this.running = true; this.controller = new AbortController(); const signal = this.controller.signal;
    this.emit('Acquiring exclusive capture worker');
    try {
      return await this.locks.request(`astrohealth.simulation.delivery|${this.key()}`, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) fail('worker_locked', 'Another tab is delivering to this capture. Stop it or wait; this worker did not start.');
        // Reload durable state after acquiring the cross-tab lock, never from a stale tab snapshot.
        let stored;
        try { stored = JSON.parse(this.storage.getItem(this.key())); } catch { fail('checkpoint_storage', 'Cannot reload the durable checkpoint.'); }
        this.validateStored(stored, this.state.binding); this.state = stored;
        let pages = 0;
        while (true) {
          signal.throwIfAborted();
          if (++pages > 501) fail('export_range', 'Export exceeded the bounded retained-history scan.');
          const binding = await this.freshBinding(this.state.binding.captureId, signal);
          if (!same(binding, this.state.binding)) fail('checkpoint_binding', 'Capture owner, run or mappings changed. Delivery stopped.');
          await this.probe(binding, signal);
          if (!this.state.pending) {
            const text = await this.pythonText(this.state.resumeUrl, signal);
            planPage(text, this.state.resumeUrl, binding); // Validate the entire page before any write.
            const next = copy(this.state); next.pending = { requestUrl: next.resumeUrl, text, batchIndex: 0 };
            this.save(next); // Durable original outbox BEFORE the first POST; quota errors fail closed.
          }
          const plan = planPage(this.state.pending.text, this.state.pending.requestUrl, binding);
          while (this.state.pending.batchIndex < plan.batches.length) {
            signal.throwIfAborted();
            // Recheck between split batches, including after ambiguous transport failures/reloads.
            const fresh = await this.freshBinding(binding.captureId, signal);
            if (!same(fresh, binding)) fail('checkpoint_binding', 'Capture binding changed during delivery.');
            await this.probe(binding, signal); await this.refreshCsrf(signal);
            const batch = plan.batches[this.state.pending.batchIndex]; this.emit('Submitting frozen original batch');
            const response = await this.backend(`/api/simulation/captures/${binding.captureId}/observations`, { body: batch.body, signal });
            this.validateAcknowledgement(response, batch);
            const next = copy(this.state); next.pending.batchIndex++;
            next.counts.created += response.created; next.counts.duplicates += response.duplicates;
            next.confirmed = { sequence: batch.items.at(-1).sequence, url: exportUrl(binding.workspaceId, batch.items.at(-1).sequence, plan.page.through) };
            this.save(next); // Only a fully validated success may advance the confirmed checkpoint.
          }
          const next = copy(this.state); next.pending = null; next.counts.excluded += plan.excluded;
          next.resumeUrl = plan.page.next_url || plan.page.checkpoint_url;
          this.save(next); // Scan cursor can pass explicitly excluded OTHER runs; confirmed cursor is separate.
          this.emit(plan.page.next_url ? 'Following frozen snapshot continuation' : 'Snapshot scan complete; awaiting another explicit action');
          if (!plan.page.next_url) return this.view();
        }
      });
    } catch (error) {
      this.emit(error.name === 'AbortError' ? 'Stopped; any unconfirmed originals remain pending' : 'Delivery stopped',
        error.name === 'AbortError' ? 'An interrupted POST may have committed. Retry the unchanged pending originals.' : error.message);
      throw error;
    } finally { this.running = false; this.controller = null; this.emit(this.status, this.error); }
  }
  stop() { this.controller?.abort(); }
}
