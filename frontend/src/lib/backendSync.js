// Sends check-ins saved on this device to the backend (POST /api/crew/{crewId}/checkins), in the
// shape lib/outbox.js syncOnce expects back. The HTTP call is injected so node:test can run it.

import { fromCheckinResponse, toCheckinRequest } from './contractMap.js';

/**
 * @param {object} p
 * @param {(path: string, init: object) => Promise<object>} p.post  throws { status } for an HTTP error,
 *        anything without a status when the server cannot be reached
 * @param {() => object[]} p.savedRecords  the check-ins saved on this device
 */
export function makeBackendSender({ post, savedRecords }) {
  return async function send(readings) {
    const saved = new Map(savedRecords().map((r) => [r.id, r]));
    const results = [];
    for (const reading of readings) {
      const record = saved.get(reading.id) ?? reading;
      try {
        const body = await post(`/api/crew/${encodeURIComponent(reading.crew_id)}/checkins`, {
          method: 'POST',
          headers: { 'Idempotency-Key': reading.id },
          body: JSON.stringify(toCheckinRequest(reading)),
        });
        results.push(fromCheckinResponse(record, body));
      } catch (err) {
        if (typeof err?.status === 'number') results.push({ id: reading.id, code: err.status, error: err.message });
        else throw err; // unreachable: the whole batch retries later
      }
    }
    return { results };
  };
}
