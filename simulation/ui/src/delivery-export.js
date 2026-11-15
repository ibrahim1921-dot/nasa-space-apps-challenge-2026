// Transport parsing only. Never computes measurements or reserializes engine numbers.
export class DeliveryError extends Error {
  constructor(code, message, status = 0) { super(message); this.name = 'DeliveryError'; this.code = code; this.status = status; }
}
export const fail = (code, message) => { throw new DeliveryError(code, message); };
export const utf8Bytes = text => new TextEncoder().encode(text).length;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EXPORT_PATH = '/api/v1/observations';
export const MAX_BODY = 1_048_576;
export const MAX_EXPORT = 8 * MAX_BODY;

// JSON.parse is used for metadata, while this syntax walk retains exact envelope
// substrings (including 64-bit seed integers and decimal spelling). Duplicate keys
// and pathological nesting are rejected before anything can be submitted.
export function parseOriginalJson(text) {
  if (typeof text !== 'string' || utf8Bytes(text) > MAX_EXPORT) fail('export_size', 'Export page exceeds the local 8 MiB safety limit.');
  let pos = 0;
  const invalid = () => fail('export_format', 'Python returned malformed or ambiguous JSON; nothing was submitted.');
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[pos] || 'x')) pos++; };
  function string() {
    const start = pos++;
    while (pos < text.length) {
      const char = text[pos++];
      if (char === '"') {
        try { return JSON.parse(text.slice(start, pos)); } catch { invalid(); }
      }
      if (char === '\\') pos++;
    }
    invalid();
  }
  function read(depth = 0) {
    whitespace(); const start = pos;
    if (depth > 32) invalid();
    const char = text[pos];
    if (char === '{') {
      pos++; whitespace(); const fields = new Map();
      if (text[pos] !== '}') while (true) {
        whitespace(); if (text[pos] !== '"') invalid();
        const key = string(); if (fields.has(key)) invalid();
        whitespace(); if (text[pos++] !== ':') invalid();
        fields.set(key, read(depth + 1)); whitespace();
        if (text[pos] !== ',') break;
        pos++;
      }
      if (text[pos++] !== '}') invalid();
      return { start, end: pos, fields };
    }
    if (char === '[') {
      pos++; whitespace(); const elements = [];
      if (text[pos] !== ']') while (true) {
        elements.push(read(depth + 1)); whitespace();
        if (text[pos] !== ',') break;
        pos++;
      }
      if (text[pos++] !== ']') invalid();
      return { start, end: pos, elements };
    }
    if (char === '"') string();
    else {
      const literal = text.slice(pos).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0];
      if (!literal || literal.length > 128) invalid();
      pos += literal.length;
    }
    return { start, end: pos };
  }
  const tree = read(); whitespace(); if (pos !== text.length) invalid();
  let value;
  try { value = JSON.parse(text); } catch { invalid(); }
  return { value, tree, text };
}

export function exportUrl(workspace, after = 0, through) {
  const query = new URLSearchParams({ workspace_id: workspace, after: String(after), limit: '100' });
  if (through !== undefined) query.set('through', String(through));
  return `${EXPORT_PATH}?${query}`;
}

export function checkedExportUrl(path, workspace) {
  if (typeof path !== 'string' || !path.startsWith(`${EXPORT_PATH}?`) || path.includes('#')) fail('export_link', 'Refused an unexpected export continuation URL.');
  const url = new URL(path, 'http://local.invalid');
  const keys = [...url.searchParams.keys()];
  if (url.pathname !== EXPORT_PATH || new Set(keys).size !== keys.length
      || keys.some(key => !['workspace_id', 'after', 'through', 'limit'].includes(key))
      || url.searchParams.get('workspace_id') !== workspace) fail('export_link', 'Export continuation belongs to a different workspace or endpoint.');
  const integer = (key, required = true) => {
    const raw = url.searchParams.get(key);
    if (raw === null && !required) return undefined;
    if (!/^\d+$/.test(raw || '') || !Number.isSafeInteger(Number(raw))) fail('export_link', 'Export continuation contains an invalid cursor.');
    return Number(raw);
  };
  const after = integer('after'), limit = integer('limit'), through = integer('through', false);
  if (limit < 1 || limit > 100 || after > 50000 || (through !== undefined && (through < after || through > 50000))) fail('export_link', 'Export continuation exceeds the supported range.');
  return { after, limit, through };
}

export function makeBatches(workspace, items, maxBytes = MAX_BODY) {
  const batches = []; let current = [], fragments = [];
  const prefix = `{"schema_version":"astrohealth.simulation.export.v1","synthetic":true,"workspace_id":${JSON.stringify(workspace)},"items":[`;
  const overhead = utf8Bytes(prefix) + 2; let size = overhead;
  const finish = () => batches.push({ body: `${prefix}${fragments.join(',')}]}`, items: current });
  for (const item of items) {
    if (utf8Bytes(item.rawEnvelope) > 65536) fail('record_size', 'An original envelope exceeds 64 KiB. No smaller chart projection will be substituted.');
    const fragment = `{"sequence":${item.sequence},"envelope":${item.rawEnvelope}}`, bytes = utf8Bytes(fragment);
    if (current.length && (current.length === 100 || size + bytes + 1 > maxBytes)) {
      finish(); current = []; fragments = []; size = overhead;
    }
    size += bytes + (current.length ? 1 : 0); current.push(item); fragments.push(fragment);
    if (size > maxBytes) fail('batch_size', 'An original record cannot fit in the backend byte limit.');
  }
  if (current.length) finish();
  return batches;
}

export function planPage(text, requestUrl, binding) {
  const request = checkedExportUrl(requestUrl, binding.workspaceId);
  const { value: page, tree } = parseOriginalJson(text);
  const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 50000;
  if (!page || page.schema_version !== 'astrohealth.simulation.export.v1' || page.synthetic !== true || page.durable !== false
      || page.workspace_id !== binding.workspaceId) fail('workspace_changed', 'Python workspace changed or is incompatible. Stop and register a new capture; old history/checkpoints are not transferable.');
  if (![page.after, page.through, page.last_sequence, page.retained_observations].every(integer)
      || page.after !== request.after || page.through > page.retained_observations
      || (request.through !== undefined && page.through !== request.through)
      || page.last_sequence !== Math.min(page.after + request.limit, page.through)
      || !Array.isArray(page.items) || page.items.length !== page.last_sequence - page.after) fail('export_format', 'Export snapshot boundaries or sequence coverage are inconsistent.');
  const nodes = tree.fields?.get('items')?.elements;
  if (!nodes || nodes.length !== page.items.length) fail('export_format', 'Original export items are missing.');
  const expected = new Map(binding.mappings.map(m => [m.simulationAstronautId, m.simulationCrewCode]));
  const selected = []; const ids = new Set(); let excluded = 0;
  page.items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('export_format', 'Export items must contain complete original envelope objects.');
    const envelope = item.envelope, observation = envelope?.observation;
    if (item.sequence !== page.after + index + 1 || !observation || !UUID.test(observation.simulation_metadata?.run_id || '')) fail('export_format', 'Export item sequence or run identity is invalid.');
    if (observation.simulation_metadata.run_id !== binding.runId) { excluded++; return; }
    if (envelope.schema_version !== 'astrohealth.simulation.observation.v1' || envelope.source !== 'synthetic' || envelope.is_simulated !== true
        || observation.source_kind !== 'SIMULATION' || !expected.has(observation.astronaut_id)
        || expected.get(observation.astronaut_id) !== envelope.crew_code) fail('mapping_mismatch', 'This run contains a source profile outside the approved capture mapping. No profile will be redirected or created.');
    if (!envelope.values || !Array.isArray(envelope.metrics) || !envelope.comparison_scope || !envelope.baseline_parameters || !envelope.baseline_deviations
        || typeof observation.source_record_id !== 'string' || !observation.source_record_id || ids.has(observation.source_record_id)) fail('export_format', 'A complete, uniquely identified original envelope is required.');
    ids.add(observation.source_record_id);
    const span = nodes[index].fields?.get('envelope');
    if (!span?.fields) fail('export_format', 'Envelope must be an original JSON object.');
    selected.push({ sequence: item.sequence, sourceRecordId: observation.source_record_id, rawEnvelope: text.slice(span.start, span.end) });
  });
  const validateLink = (link, frozen) => {
    const cursor = checkedExportUrl(link, binding.workspaceId);
    if (cursor.after !== page.last_sequence || cursor.limit !== request.limit || cursor.through !== (frozen ? page.through : undefined)) fail('export_link', 'Export continuation changed its frozen snapshot boundary.');
  };
  if (page.last_sequence < page.through) {
    if (page.checkpoint_url !== null) fail('export_link', 'A partial snapshot cannot be a completed checkpoint.');
    validateLink(page.next_url, true);
  } else {
    if (page.next_url !== null) fail('export_link', 'Completed snapshot has an unexpected next page.');
    validateLink(page.checkpoint_url, false);
  }
  return { page, batches: makeBatches(binding.workspaceId, selected), excluded };
}
