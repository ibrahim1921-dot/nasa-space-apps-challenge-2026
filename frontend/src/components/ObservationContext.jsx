import { activityLabel, contextLabel, sourceLabel } from '../lib/observationContext.js';

export default function ObservationContext({ context = {} }) {
  const timestamp = context.measuredAt || context.recordedAt;
  const validTime = timestamp && Number.isFinite(Date.parse(timestamp));
  return <details className="observation-context">
    <summary>{activityLabel(context.activityContext)} · {sourceLabel(context.sourceKind)}</summary>
    <dl>
      <div><dt>Activity context source</dt><dd>{({ SELF_REPORTED: 'Astronaut', DEVICE_REPORTED: 'Device', SIMULATION_SCENARIO: 'Simulation scenario', MEASUREMENT_TYPE: 'Completed sleep report', UNKNOWN: 'Not recorded' })[context.contextOrigin] || 'Not recorded'}</dd></div>
      {context.bodyPosition && <div><dt>Body position</dt><dd>{contextLabel(context.bodyPosition)}</dd></div>}
      <div><dt>Mission phase</dt><dd>{contextLabel(context.missionPhase)}</dd></div>
      {context.workload && <div><dt>Workload</dt><dd>{contextLabel(context.workload)}</dd></div>}
      {context.scenario && <div><dt>Simulation scenario</dt><dd>{contextLabel(context.scenario)}</dd></div>}
      {context.scenarioPhase && <div><dt>Scenario phase</dt><dd>{contextLabel(context.scenarioPhase)}</dd></div>}
      {typeof context.activityIntensity === 'number' && <div><dt>Configured activity intensity</dt><dd>{context.activityIntensity} (simulated)</dd></div>}
      {validTime && <div><dt>{context.measuredAt ? 'Measured' : 'Recorded'}</dt><dd><time dateTime={timestamp}>{new Date(timestamp).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}</time></dd></div>}
    </dl>
    {context.notes && <p className="observation-context__notes">{context.notes}</p>}
    <p className="muted">Context supports review; it does not override monitoring alerts.</p>
  </details>;
}
