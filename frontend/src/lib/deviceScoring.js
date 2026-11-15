// Scoring on this device, with the bundled data files and the readings saved here.
// Thin wrapper over lib/scoring.js (the same code /api/sync runs), so it works with no network.
import { crewDaysOf, preflightTestsOf } from '../data/bundled.js';
import { SCORED_ON, scoreCheckin, scoreStandTest } from './scoring.js';
import { extraHistoryFor } from './vitalsCheckinStore.js';
import { sensorDaysUntil } from './sensorFeed.js';

/** This person's simulated sensor days up to `today`, from the bundled crew.json and the demo state. */
export function sensorDaysFor(crewId, demo, today) {
  return sensorDaysUntil({ crewId, crewDays: crewDaysOf(crewId), untilDate: today, demo });
}

/**
 * Score a daily check-in against crew.json days, simulated sensor days before it, and this person's
 * earlier check-ins on this device. A CMO exam passes the patient's crewId and sensor days and
 * kindDetail 'cmo_exam', so it is scored against the patient's own history.
 */
export function scoreCheckinOnDevice({ crewId, reading, at = new Date().toISOString(), sensorDays = [], kindDetail = null }) {
  return scoreCheckin({
    kindDetail,
    crewId,
    reading,
    crewDays: crewDaysOf(crewId),
    saved: extraHistoryFor(crewId),
    sensorDays,
    at,
    scoredOn: SCORED_ON.device,
  });
}

/** Score a stand test against this person's bundled preflight tests. */
export function scoreStandTestOnDevice({ crewId, test }) {
  return scoreStandTest({ test, preflightTests: preflightTestsOf(crewId), scoredOn: SCORED_ON.device });
}
