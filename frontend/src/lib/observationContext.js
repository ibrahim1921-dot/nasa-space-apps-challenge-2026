import { WORKLOAD_OPTIONS as CHECKIN_WORKLOAD_OPTIONS } from '../constants/checkin.js';

// Same activity identifiers as indicator_contexts and simulation.engine.catalog.CONTEXTS.
export const ACTIVITY_OPTIONS = [
  { value: 'UNKNOWN', label: 'Not recorded / unknown' },
  { value: 'RESTING', label: 'Resting' },
  { value: 'EXERCISING', label: 'Exercising' },
  { value: 'SLEEPING', label: 'Sleeping' },
  { value: 'OTHER', label: 'Other activity / mission operations' },
];
export const POSITION_OPTIONS = ['SEATED', 'STANDING', 'LYING_DOWN', 'FREE_FLOATING'];
export const MISSION_PHASES = ['PREFLIGHT', 'IN_FLIGHT', 'POSTFLIGHT'];
export const WORKLOAD_OPTIONS = CHECKIN_WORKLOAD_OPTIONS.map((option) => option.value);
export const INDICATOR_CODES = { glucose: 'blood_sugar', temperature: 'body_temperature' };
export const indicatorCode = (id) => INDICATOR_CODES[id] || id;
export const contextLabel = (value) => value ? value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) : 'Not recorded';
export const activityLabel = (value) => value === 'OTHER' ? 'Other activity' : value === 'UNKNOWN' || !value ? 'Activity not recorded' : contextLabel(value);
export const sourceLabel = (value) => ({ SIMULATION: 'Synthetic', SELF_REPORT: 'Manual entry', DEVICE: 'Device', CLINICAL: 'Clinical', IMPORT: 'Imported' })[value] || 'Source not recorded';
export const supportsPosition = (id) => ['blood_pressure', 'heart_rate'].includes(indicatorCode(id));

export function validateObservationContext(value = {}, id) {
  if (!ACTIVITY_OPTIONS.some((option) => option.value === (value.activityContext || 'UNKNOWN'))) return 'Choose a supported activity.';
  if (value.bodyPosition && (!supportsPosition(id) || !POSITION_OPTIONS.includes(value.bodyPosition))) return 'Choose a supported body position.';
  if (value.missionPhase && !MISSION_PHASES.includes(value.missionPhase)) return 'Choose a supported mission phase.';
  if (value.workload && !WORKLOAD_OPTIONS.includes(value.workload)) return 'Choose a supported workload.';
  if (typeof value.notes !== 'undefined' && (typeof value.notes !== 'string' || value.notes.length > 500)) return 'Keep measurement notes to 500 characters.';
  return null;
}

export function captureObservationContext(value = {}, id, recordedAt = new Date().toISOString()) {
  const problem = validateObservationContext(value, id);
  if (problem) throw new Error(problem);
  const activityContext = id === 'sleep_hours' ? 'SLEEPING' : value.activityContext || 'UNKNOWN';
  return {
    activityContext, sourceKind: 'SELF_REPORT', recordedAt,
    contextOrigin: id === 'sleep_hours' ? 'MEASUREMENT_TYPE' : activityContext === 'UNKNOWN' ? 'UNKNOWN' : 'SELF_REPORTED',
    bodyPosition: supportsPosition(id) ? value.bodyPosition || null : null,
    missionPhase: value.missionPhase || null,
    workload: ['EXERCISING', 'OTHER'].includes(activityContext) ? value.workload || null : null,
    notes: value.notes?.trim() || '',
  };
}

/** Legacy records remain readable; questionnaire workload is not measurement activity. */
export function contextForRecord(record, id) {
  const saved = record?.payload?.observationContexts?.[indicatorCode(id)];
  const synthetic = Boolean(record?.fromCrewRecord || record?.payload?.origin === 'seed');
  return {
    bodyPosition: POSITION_OPTIONS.includes(saved?.bodyPosition) ? saved.bodyPosition : null,
    missionPhase: MISSION_PHASES.includes(saved?.missionPhase) ? saved.missionPhase : null,
    workload: WORKLOAD_OPTIONS.includes(saved?.workload) ? saved.workload : null,
    notes: typeof saved?.notes === 'string' ? saved.notes : '',
    activityContext: ACTIVITY_OPTIONS.some((option) => option.value === saved?.activityContext) ? saved.activityContext : 'UNKNOWN',
    sourceKind: synthetic ? 'SIMULATION' : record?.payload?.reading ? 'SELF_REPORT' : 'UNKNOWN',
    recordedAt: saved?.recordedAt || record?.recorded_at || null,
    contextOrigin: saved?.contextOrigin || 'UNKNOWN',
  };
}
