import { hasSymptoms, needsUrgentHelp } from './wellnessCheckin.js';

// Suggestions for a conversation with the medical officer, not diagnoses or vitals evaluations.
export function wellnessAttention(answers) {
  if (needsUrgentHelp(answers)) return {
    urgent: true,
    title: 'Contact the medical officer now',
    checks: ['Ask a crewmate for help and follow your mission emergency procedure. Do not wait for another reading or check-in.'],
  };
  const checks = [];
  const symptoms = hasSymptoms(answers);
  if (symptoms && (answers.severity === 'severe' || answers.course === 'worsening' || answers.impact === 'unable')) {
    checks.push('Contact the medical officer promptly about severe or worsening symptoms, or difficulty doing your usual tasks.');
  }
  if (answers.hydration === 'unable') checks.push('Contact the medical officer promptly because you cannot keep fluids down.');
  if (symptoms) checks.push('Review the latest device readings with the medical officer alongside when your symptoms started and how they have changed.');
  if (answers.symptoms.includes('headache') || answers.symptoms.includes('pain')) checks.push('Check the location and pattern of discomfort, including what brings it on or relieves it. Share this with the medical officer.');
  if (answers.symptoms.includes('dizziness')) checks.push('Tell the medical officer when dizziness occurs, including whether it follows a change in position. Ask whether a supervised assessment is needed.');
  if (answers.symptoms.includes('breathing')) checks.push('Discuss breathing discomfort or cough with the medical officer. If breathing becomes severe or chest pain develops, seek help immediately.');
  if (answers.hydration === 'less' || answers.appetite !== 'usual' || answers.symptoms.some((id) => ['nausea', 'digestive'].includes(id))) checks.push('Review recent meals, fluid intake, and any vomiting or bowel changes with the medical officer.');
  if (answers.sleepQuality !== 'rested' || answers.symptoms.includes('fatigue')) checks.push('Compare how rested you feel with the recorded sleep summary, recent workload, and recovery time.');
  if (['low', 'anxious'].includes(answers.mood) || answers.stress !== 'manageable' || answers.workload === 'overloaded') checks.push('Arrange a wellbeing check with the medical officer or a trusted crewmate, including how stress and workload are affecting you.');
  if (!checks.length) checks.push('Continue your scheduled monitoring. Report any new symptoms or changes in how you feel.');
  return { urgent: false, title: 'Suggested checks', checks };
}
