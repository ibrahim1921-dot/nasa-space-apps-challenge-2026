// "What to do now" steps for each daily-vitals indicator. App guidance, not a clinical protocol.
// Used by lib/vitalsCheckin.js (the evaluate API) and by the action cards in the UI.
// The urgent first line for a crisis comes from the limit's `action` in content/limits.js.

/** Steps for a hypertensive-crisis BP reading. */
export const CRISIS_STEPS = [
  'Sit quietly and re-check your blood pressure.',
  'Do not start EVA or heavy work.',
  'Report any chest pain, headache, vision change or weakness at once.',
];

/** Steps per indicator and level: { [indicator]: { watch: string[], alert: string[] } } */
export const VITALS_STEPS = {
  blood_pressure: {
    watch: [
      'Sit quietly for 5 minutes, then re-check with the cuff at heart height.',
      'Go easy on salt and caffeine today.',
      'Check again tomorrow morning before coffee or exercise.',
    ],
    alert: [
      'Sit quietly for 5 minutes, then re-check with the cuff at heart height.',
      'Avoid heavy exercise until a re-check is back under the alert line.',
      'Log any headache, chest pain or vision change.',
    ],
  },
  heart_rate: {
    watch: [
      'Rest seated for 5 minutes and re-check.',
      'Drink water and note any recent caffeine, stress or poor sleep.',
      'Check again tomorrow at the same time.',
    ],
    alert: [
      'Stop what you are doing, sit down and re-check after 5 minutes of rest.',
      'Report palpitations, dizziness, chest pain or shortness of breath at once.',
      'Do not start exercise or EVA until it settles.',
    ],
  },
  glucose: {
    watch: [
      'Re-check tomorrow after a full overnight fast (8 hours, water only).',
      'Note what and when you last ate, and any illness or poor sleep.',
    ],
    alert: [
      'If it is low: take 15 g of fast sugar (juice or glucose tabs) and re-check in 15 minutes.',
      'If it is high: drink water and re-check after a proper overnight fast.',
      'Report shakiness, sweating, confusion or strong thirst at once.',
    ],
  },
  temperature: {
    watch: [
      'Re-check in an hour with the same thermometer, after 15 minutes without food or drink.',
      'Note any sore throat, cough, aches or chills.',
      'Rest and drink fluids.',
    ],
    alert: [
      'Re-check in 30 minutes with the same thermometer.',
      'Rest, drink fluids and limit close contact with crewmates.',
      'Tell the Crew Medical Officer: a fever in a closed cabin can spread.',
    ],
  },
  sleep_hours: {
    watch: [
      'Protect tonight’s sleep window: screens off and lights low 30 minutes before.',
      'Avoid caffeine after midday.',
      'Take care with tasks that need full attention today.',
    ],
    alert: [
      'Avoid safety-critical work today if you can, or ask a crewmate to double-check it.',
      'Plan a recovery sleep or a short nap (under 30 minutes).',
      'Tell the Crew Medical Officer if this keeps happening.',
    ],
  },
  mood: {
    watch: [
      'Take a short break and do something you enjoy today.',
      'Talk to a crewmate you trust, or book a private call home.',
      'Note what is weighing on you; it helps to spot patterns.',
    ],
    alert: [
      'Talk to the Crew Medical Officer or the psychological support team today.',
      'Book a private conference with family or support on the next pass.',
      'Ask a crewmate to check in with you later today.',
    ],
  },
};
