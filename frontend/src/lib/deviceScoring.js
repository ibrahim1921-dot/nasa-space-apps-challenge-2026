// Scoring on this device, with the bundled data files and the readings saved here.
// Thin wrapper over lib/scoring.js (the same rules the backend applies), so it works with no network.
import { crewDaysOf, preflightTestsOf } from '../data/bundled.js';
import { SCORED_ON, scoreCheckin, scoreStandTest } from './scoring.js';
import { extraHistoryFor } from './vitalsCheckinStore.js';

/** Score a daily check-in against crew.json days plus this person's earlier check-ins on this device. */
export function scoreCheckinOnDevice({ crewId, reading, at = new Date().toISOString() }) {
  return scoreCheckin({
    crewId,
    reading,
    crewDays: crewDaysOf(crewId),
    saved: extraHistoryFor(crewId),
    at,
    scoredOn: SCORED_ON.device,
  });
}

/** Score a stand test against this person's bundled preflight tests. */
export function scoreStandTestOnDevice({ crewId, test }) {
  return scoreStandTest({ test, preflightTests: preflightTestsOf(crewId), scoredOn: SCORED_ON.device });
}
