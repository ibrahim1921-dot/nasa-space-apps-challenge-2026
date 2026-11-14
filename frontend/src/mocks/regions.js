// Mock body-region data. Region status is supplied explicitly (the ML model will
// provide it directly later), not derived from the indicators.
// Indicator shape: { id, name, value, unit, status | limitKey, trend, trendText, history?, sample? }
// Indicators with a `limitKey` get their status from content/limits.js via lib/rangeCheck.js;
// `sample: true` marks an indicator added only as labelled sample data.
// `history` holds the last 7 daily values (oldest first) for the sparkline.

export const regionStatuses = {
  head: 'watch',
  chest: 'normal',
  abdomen: 'watch',
  limbs: 'alert',
};

export const regionIndicators = {
  head: [
    { id: 'reaction-time', name: 'Reaction time', value: 312, unit: 'ms', status: 'watch', limitKey: 'reaction_test', trend: 'up', trendText: 'Up 18 ms since last week', history: [294, 297, 300, 302, 306, 309, 312] },
    { id: 'optic-nerve', name: 'Optic nerve sheath', value: 5.6, unit: 'mm', status: 'watch', trend: 'up', trendText: 'Up 0.2 mm since launch', history: [5.4, 5.45, 5.45, 5.5, 5.55, 5.55, 5.6] },
    { id: 'headache-reports', name: 'Headache reports', value: 1, unit: 'this week', status: 'normal', trend: 'flat', trendText: 'Same as last week', history: [0, 0, 1, 0, 0, 0, 0] },
    { id: 'cognitive-score', name: 'Cognitive test score', value: 92, unit: '/ 100', status: 'normal', trend: 'flat', trendText: 'Steady over 7 sessions', history: [91, 93, 92, 92, 93, 91, 92] },
    { id: 'icp-estimate', name: 'Intracranial pressure estimate', value: 14, unit: 'mmHg', status: 'normal', trend: 'up', trendText: 'Up 1 mmHg since day 120', history: [13, 13, 13, 13.5, 13.5, 14, 14] },
  ],
  chest: [
    { id: 'heart-rate', name: 'Resting heart rate', value: 72, unit: 'bpm', limitKey: 'resting_hr', trend: 'flat', trendText: 'Steady over the last 24 hours', history: [71, 73, 72, 70, 72, 73, 72] },
    { id: 'blood-oxygen', name: 'Blood oxygen', value: 97, unit: '%', status: 'normal', trend: 'flat', trendText: 'Within normal range', history: [97, 98, 97, 97, 98, 97, 97] },
    { id: 'blood-pressure', name: 'Blood pressure', value: '118/76', unit: 'mmHg', limitKey: 'blood_pressure', trend: 'flat', trendText: 'Within normal range', history: [117, 119, 118, 116, 118, 119, 118] },
    { id: 'breathing-rate', name: 'Breathing rate', value: 14, unit: '/ min', status: 'normal', trend: 'down', trendText: 'Down 1 since yesterday', history: [15, 15, 15, 14, 15, 15, 14] },
    { id: 'cabin-co2', name: 'Cabin CO₂ exposure', value: 2.8, unit: 'mmHg', status: 'normal', trend: 'up', trendText: 'Up 0.3 since yesterday', history: [2.4, 2.5, 2.4, 2.5, 2.6, 2.5, 2.8] },
  ],
  abdomen: [
    { id: 'hydration', name: 'Hydration', value: 2.1, unit: 'L/day', status: 'watch', trend: 'down', trendText: '0.4 L below target', history: [2.6, 2.5, 2.5, 2.3, 2.2, 2.2, 2.1] },
    { id: 'calorie-intake', name: 'Calorie intake', value: 2650, unit: 'kcal', status: 'normal', trend: 'flat', trendText: 'On target', history: [2600, 2700, 2640, 2680, 2620, 2700, 2650] },
    { id: 'kidney-stone-risk', name: 'Kidney stone risk (urine calcium)', value: 6.8, unit: 'mmol/day', status: 'watch', trend: 'up', trendText: 'Up 0.9 since last week', history: [5.9, 6.0, 6.2, 6.3, 6.5, 6.6, 6.8] },
    { id: 'body-mass', name: 'Body mass', value: 68.4, unit: 'kg', status: 'normal', trend: 'down', trendText: 'Down 0.6 kg this month', history: [69.0, 68.9, 68.8, 68.7, 68.6, 68.5, 68.4] },
    { id: 'fasting-glucose', name: 'Fasting blood sugar', value: 92, unit: 'mg/dL', limitKey: 'fasting_glucose', sample: true, trend: 'flat', trendText: 'Steady over the last 7 mornings', history: [94, 91, 93, 90, 92, 93, 92] },
    { id: 'gut-symptoms', name: 'Gut symptoms', value: 0, unit: 'reports this week', status: 'normal', trend: 'flat', trendText: 'None reported', history: [0, 1, 0, 0, 0, 0, 0] },
  ],
  limbs: [
    { id: 'bone-density', name: 'Bone density change', value: -1.4, unit: '% / month', status: 'alert', trend: 'down', trendText: 'Faster loss than last month', history: [-0.9, -1.0, -1.1, -1.1, -1.2, -1.3, -1.4] },
    { id: 'leg-muscle-volume', name: 'Leg muscle volume', value: -6.2, unit: '% since launch', status: 'alert', trend: 'down', trendText: 'Down 0.8 % this month', history: [-5.4, -5.5, -5.7, -5.8, -5.9, -6.1, -6.2] },
    { id: 'grip-strength', name: 'Grip strength', value: 41, unit: 'kg', status: 'watch', trend: 'down', trendText: 'Down 2 kg this month', history: [43, 43, 42, 42, 42, 41, 41] },
    { id: 'exercise-time', name: 'Exercise time', value: 2.1, unit: 'h/day', status: 'normal', trend: 'flat', trendText: 'Meeting the daily target', history: [2.0, 2.2, 2.1, 2.0, 2.2, 2.1, 2.1] },
    { id: 'joint-pain', name: 'Joint pain reports', value: 3, unit: 'this week', status: 'watch', trend: 'up', trendText: 'Up from 1 last week', history: [0, 0, 1, 0, 1, 0, 1] },
  ],
};
