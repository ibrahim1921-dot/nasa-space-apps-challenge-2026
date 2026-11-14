// The vitals part of the daily check-in: one indicator per screen, each with a short how-to.
// Input plausibility ranges come from lib/vitalsCheckin.js (READING_FIELDS); health limits from content/limits.js.

export const VITALS_SCREENS = [
  {
    id: 'blood_pressure',
    title: 'Blood pressure',
    fields: [
      { key: 'systolic', label: 'Systolic (top number)', unit: 'mmHg', step: '1', inputMode: 'numeric' },
      { key: 'diastolic', label: 'Diastolic (bottom number)', unit: 'mmHg', step: '1', inputMode: 'numeric' },
    ],
    howTo: {
      posture: 'Sit with your back supported and feet flat (or in foot loops) for 5 minutes first. Cuff on the bare upper arm, at heart height, arm resting.',
      timing: 'Morning, before coffee and exercise. Stay still and quiet during the reading.',
      skew: 'Caffeine, exercise or a full bladder in the last 30 minutes, talking, or a cuff over clothing.',
    },
  },
  {
    id: 'heart_rate',
    title: 'Resting heart rate',
    fields: [{ key: 'heart_rate', label: 'Resting heart rate', unit: 'bpm', step: '1', inputMode: 'numeric' }],
    howTo: {
      posture: 'Still seated after the BP reading. Use the cuff’s pulse reading, or count for 30 seconds and double it.',
      timing: 'Right after blood pressure, before you get up.',
      skew: 'Caffeine, standing up just before, stress, a hot cabin, or exercise in the last hour.',
    },
  },
  {
    id: 'glucose',
    title: 'Fasting blood sugar',
    fields: [{ key: 'glucose', label: 'Fasting blood sugar', unit: 'mg/dL', step: '1', inputMode: 'numeric' }],
    howTo: {
      posture: 'Wash and dry your hands, then use the side of a fingertip. Wipe away the first drop if your kit says to.',
      timing: 'On waking, after at least 8 hours with nothing but water.',
      skew: 'A late snack or sweet drink, illness, poor sleep, stress, or sugar left on the finger.',
    },
  },
  {
    id: 'temperature',
    title: 'Body temperature',
    fields: [{ key: 'temperature', label: 'Temperature', unit: '°C', step: '0.1', inputMode: 'decimal' }],
    howTo: {
      posture: 'Oral: under the tongue, mouth closed, until it beeps. Use the same thermometer each day.',
      timing: 'Before breakfast, and at least 15 minutes after eating, drinking or exercise.',
      skew: 'Hot or cold drinks, exercise, a warm sleep station, or breathing through your mouth.',
    },
  },
  {
    id: 'sleep_hours',
    title: 'Sleep last night',
    fields: [{ key: 'sleep_hours', label: 'Hours of sleep last night', unit: 'h', step: '0.25', inputMode: 'decimal' }],
    howTo: {
      posture: 'Count from when you fell asleep to when you woke, minus any long wake-ups. Use your watch or sleep log if you have one.',
      timing: 'Enter it on waking, while you remember the night.',
      skew: 'Time spent awake in the sleep station counts against it; naps are not included.',
    },
  },
  {
    id: 'mood',
    title: 'Mood',
    fields: [{ key: 'mood', label: 'How is your mood today?', unit: '/ 5', kind: 'scale' }],
    howTo: {
      posture: 'Go with your first honest answer. There is no right score.',
      timing: 'Think about the whole morning, not just this minute.',
      skew: 'One bad moment just before the check-in, or rating how you think you should feel.',
    },
  },
];

export const MOOD_OPTIONS = [
  { value: '1', label: '1', srLabel: 'Very low' },
  { value: '2', label: '2', srLabel: 'Low' },
  { value: '3', label: '3', srLabel: 'Okay' },
  { value: '4', label: '4', srLabel: 'Good' },
  { value: '5', label: '5', srLabel: 'Very good' },
];
