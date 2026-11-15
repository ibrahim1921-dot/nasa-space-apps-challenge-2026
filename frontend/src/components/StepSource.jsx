import { EMERGENCY_SOURCES } from '../content/limits.js';

/** Source line under each emergency step: "AHA/ERC", "Microgravity CPR guideline 2020" or "Team-set". */
export default function StepSource({ source }) {
  const s = EMERGENCY_SOURCES[source];
  if (!s) return null;
  return (
    <p className={`emg-source${s.team_set ? ' emg-source--team' : ''}`}>
      <span className="emg-source__key">Source:</span> {s.source_short}
    </p>
  );
}
