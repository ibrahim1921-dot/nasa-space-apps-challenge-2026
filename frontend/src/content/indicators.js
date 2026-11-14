const risks = 'https://www.nasa.gov/hrp/risks/';
const hazards = 'https://www.nasa.gov/hrp/hazards/';
// TEAM REVIEW: confirm wording of practical measurement instructions.
export const indicators = {
  heart_rate: { name: 'Heart rate', unit: 'bpm', measure: 'Sit still for 5 minutes. Use your heart-rate monitor while resting; recent exercise can affect the reading.', space: 'Weightlessness changes blood circulation and how the heart and blood vessels work, which may raise the risk of cardiovascular events. All astronauts exercise to counter losses in bone density, muscle strength and heart and blood-vessel performance.', hazard: 'Gravity fields', source: risks, min: 1, max: 350 },
  blood_pressure: { name: 'Blood pressure', unit: 'mmHg', measure: 'Sit quietly with your back supported and feet resting. Support your arm and follow your cuff instructions. Movement can affect the reading.', space: 'Weightlessness changes blood circulation and how the heart and blood vessels work, which may raise the risk of cardiovascular events. All astronauts exercise to counter losses in bone density, muscle strength and heart and blood-vessel performance.', hazard: 'Gravity fields', source: risks, min: 1, max: 400 },
  blood_sugar: { name: 'Blood sugar', unit: 'mg/dL', measure: 'Use your approved glucose meter according to its instructions. Clean and dry your hands. Note when you last ate.', space: 'NASA lists inadequate food and nutrition as a spaceflight risk; a balanced diet is essential to crew health and performance.', hazard: 'Hostile and closed environments', source: risks, min: 1, max: 1000 },
  body_temperature: { name: 'Body temperature', unit: '°C', measure: 'Use a thermometer according to its instructions, using the same measurement site each time. Recent hot or cold drinks can affect oral readings.', space: 'Spaceflight stress can reactivate dormant viruses in the body, causing rashes and other symptoms. Cabin temperature is also part of the closed environment crews live in.', hazard: 'Hostile and closed environments', source: risks, sources: [risks, hazards], min: 20, max: 50 },
  sleep_hours: { name: 'Sleep', unit: 'h', measure: 'Estimate the hours you actually slept during your last sleep period, excluding time awake. Use your sleep log to help.', space: 'Crews face chronic sleep loss, constant work demands and disrupted body clocks.', hazard: 'Isolation and confinement', source: risks, min: 0, max: 24 },
  mood: { name: 'Mood', unit: '/ 5', measure: 'Take a quiet moment to reflect on how you feel now. Choose the answer that fits you best.', space: 'Isolation, radiation, distance from Earth and other stressors may affect crew mental health; crews must be chosen, trained and supported to work as a team for months or years.', hazard: 'Isolation and confinement', source: risks, sources: [risks, hazards], min: 1, max: 5 },
};
export const indicatorIds = Object.keys(indicators);
export const regions = [
  { id: 'head', name: 'Head', description: 'Supports thinking, mood and sleep rhythms.', indicators: ['mood', 'sleep_hours'] },
  { id: 'chest', name: 'Chest', description: 'The heart circulates blood through the body.', indicators: ['heart_rate', 'blood_pressure'] },
  { id: 'abdomen', name: 'Abdomen', description: 'Digestion helps the body use energy from food.', indicators: ['blood_sugar'] },
  { id: 'whole_body', name: 'Whole body', description: 'Body temperature provides a whole-body measurement.', indicators: ['body_temperature'] },
  { id: 'bones_muscles', name: 'Bones and muscles', description: 'All astronauts exercise to counter losses in bone density and muscle strength.', indicators: [] },
];
export const hazardText = 'NASA groups spaceflight hazards into five: space radiation, isolation and confinement, distance from Earth, gravity fields, hostile and closed environments.';
