// Self-reported wellness answers are separate from measured vitals and their scoring.
import { newRecordId, notifyRecordsChanged } from './standTestStore.js';

export const SYMPTOMS = [
  ['none', 'No symptoms'], ['headache', 'Headache'], ['dizziness', 'Dizziness or light-headedness'],
  ['nausea', 'Nausea or vomiting'], ['pain', 'Pain or discomfort'], ['fatigue', 'Unusual tiredness'],
  ['breathing', 'Breathing discomfort or cough'], ['digestive', 'Stomach or bowel changes'],
  ['other', 'Something else'],
];
export const URGENT_SIGNS = [
  ['none', 'None of these'], ['chest', 'Chest pain or pressure'],
  ['breathing', 'Severe difficulty breathing'], ['confusion', 'Sudden confusion or trouble speaking'],
  ['fainting', 'Fainting or collapse'],
];
export const OPTIONS = {
  severity: [['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe']],
  onset: [['today', 'Today'], ['yesterday', 'Yesterday'], ['earlier', 'Earlier than yesterday']],
  course: [['improving', 'Getting better'], ['steady', 'About the same'], ['worsening', 'Getting worse'], ['intermittent', 'Comes and goes']],
  impact: [['none', 'No effect'], ['some', 'Slowing me down'], ['unable', 'Unable to do usual tasks']],
  sleepQuality: [['rested', 'Rested'], ['unrested', 'Not rested'], ['disrupted', 'Often waking up']],
  appetite: [['usual', 'As usual'], ['less', 'Less than usual'], ['more', 'More than usual']],
  hydration: [['usual', 'Drinking as usual'], ['less', 'Less than usual'], ['unable', 'Cannot keep fluids down']],
  mood: [['good', 'Good'], ['okay', 'Okay'], ['low', 'Low'], ['anxious', 'Anxious']],
  stress: [['manageable', 'Manageable'], ['strained', 'Feeling strained'], ['overwhelmed', 'Overwhelmed']],
  workload: [['light', 'Light'], ['normal', 'Normal'], ['heavy', 'Heavy'], ['overloaded', 'Overloaded']],
};
export const INITIAL_WELLNESS = {
  symptoms: [], urgentSigns: [], severity: '', onset: '', course: '', impact: '',
  location: '', triggers: '', changes: '', symptomNotes: '',
  sleepQuality: '', appetite: '', hydration: '', mood: '', stress: '', workload: '', notes: '',
};
export const hasSymptoms = (answers) => answers.symptoms.some((id) => id !== 'none');
export const needsUrgentHelp = (answers) => answers.urgentSigns.some((id) => id !== 'none');
export function toggleAnswer(selected, id) {
  if (id === 'none') return selected.includes(id) ? [] : ['none'];
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected.filter((item) => item !== 'none'), id];
}
export function validateWellness(answers, step) {
  const errors = {};
  if (step === 0) {
    for (const [key, choices] of [['symptoms', SYMPTOMS], ['urgentSigns', URGENT_SIGNS]]) {
      const selected = answers[key];
      if (!Array.isArray(selected) || !selected.length || selected.some((id) => !choices.some(([value]) => value === id)) || (selected.includes('none') && selected.length > 1)) errors[key] = 'Choose the answers that apply, or select none.';
    }
  }
  const required = step === 1 && hasSymptoms(answers) ? ['severity', 'onset', 'course', 'impact'] : step === 2 ? ['sleepQuality', 'appetite', 'hydration', 'mood', 'stress', 'workload'] : [];
  for (const key of required) if (!OPTIONS[key].some(([value]) => value === answers[key])) errors[key] = 'Choose an answer.';
  for (const key of ['location', 'triggers', 'changes', 'symptomNotes', 'notes']) if (typeof answers[key] !== 'string' || answers[key].length > 500) errors[key] = 'Keep this answer to 500 characters.';
  return errors;
}
export function makeWellnessRecord(crewId, answers, recordedAt = new Date().toISOString()) {
  if (!crewId) throw new Error('Sign in before saving a check-in.');
  for (const step of [0, 1, 2]) if (Object.keys(validateWellness(answers, step)).length) throw new Error('Complete the unanswered questions.');
  const clean = Object.fromEntries(Object.keys(INITIAL_WELLNESS).map((key) => [key, Array.isArray(answers[key]) ? [...answers[key]] : answers[key].trim()]));
  if (!hasSymptoms(clean)) for (const key of ['severity', 'onset', 'course', 'impact', 'location', 'triggers', 'symptomNotes']) clean[key] = '';
  return { id: newRecordId(), kind: 'wellness_checkin', crew_id: crewId, recorded_at: recordedAt, source: 'self_report', answers: clean };
}
const KEY = 'ahm.wellnessCheckins.v1';
export function readWellnessCheckins(crewId) {
  try {
    const records = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(records) ? records.filter((r) => r?.kind === 'wellness_checkin' && r.crew_id === crewId && r.answers && Number.isFinite(Date.parse(r.recorded_at))).sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at)) : [];
  } catch { return []; }
}
export function writeWellnessCheckin(record) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    const records = Array.isArray(raw) ? raw : [];
    window.localStorage.setItem(KEY, JSON.stringify([record, ...records.filter((r) => r?.id !== record.id)].slice(0, 500)));
    notifyRecordsChanged();
    return true;
  } catch { return false; }
}
