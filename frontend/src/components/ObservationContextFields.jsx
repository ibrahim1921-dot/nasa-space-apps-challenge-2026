import { ACTIVITY_OPTIONS, POSITION_OPTIONS, MISSION_PHASES, WORKLOAD_OPTIONS, contextLabel, supportsPosition } from '../lib/observationContext.js';

export default function ObservationContextFields({ indicator, value = {}, onChange }) {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.value });
  return (
    <details className="observation-context-fields">
      <summary>Measurement conditions (optional)</summary>
      <div className="observation-context-fields__grid">
        {indicator !== 'sleep_hours' ? <label className="field">Activity
          <select className="input" value={value.activityContext || 'UNKNOWN'} onChange={set('activityContext')}>
            {ACTIVITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label> : <p className="muted">Activity: sleeping (completed sleep report).</p>}
        {supportsPosition(indicator) && <label className="field">Body position
          <select className="input" value={value.bodyPosition || ''} onChange={set('bodyPosition')}>
            <option value="">Not recorded</option>{POSITION_OPTIONS.map((position) => <option key={position} value={position}>{contextLabel(position)}</option>)}
          </select>
        </label>}
        <label className="field">Mission phase
          <select className="input" value={value.missionPhase || ''} onChange={set('missionPhase')}>
            <option value="">Not recorded</option>{MISSION_PHASES.map((phase) => <option key={phase} value={phase}>{contextLabel(phase)}</option>)}
          </select>
        </label>
        {['EXERCISING', 'OTHER'].includes(value.activityContext) && <label className="field">Workload at this measurement
          <select className="input" value={value.workload || ''} onChange={set('workload')}>
            <option value="">Not recorded</option>{WORKLOAD_OPTIONS.map((workload) => <option key={workload} value={workload}>{contextLabel(workload)}</option>)}
          </select>
        </label>}
      </div>
      <label className="field">Measurement notes (optional)
        <textarea className="input" rows={2} maxLength={500} value={value.notes || ''} onChange={set('notes')} />
      </label>
      <p className="muted">Applies only to this reading. Source and entry time are recorded automatically.</p>
      {indicator === 'heart_rate' && value.activityContext === 'EXERCISING' && <p className="muted">This check-in uses the existing resting/reference checks. Exercise context does not cancel an alert; review the result with the medical officer.</p>}
    </details>
  );
}
