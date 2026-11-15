// DEMO DATA: model not connected yet.
//
// Hand-written examples in the shape services/assessmentService.js expects, so the screen can be built
// before Augustine's backend endpoint exists. Nothing here comes from a model, from crew records or from
// any real person. Values are illustrative only and are not thresholds or clinical findings.
//
// Keyed by crew code (crew-01..04). One example of each state the screen must handle:
//   crew-01  normal assessment
//   crew-02  anomaly flagged (reconstruction error above threshold)
//   crew-03  insufficient input (missing indicators)
//   crew-04  error from the assessment service

export const MOCK_MODEL = { name: 'demo-autoencoder', version: '0.0.0-demo' };

export const MOCK_ASSESSMENTS = {
  'crew-01': {
    assessedAt: '2026-11-15T08:00:00Z',
    model: MOCK_MODEL,
    risk: {
      class: 'LOW',
      probability: 0.12,
      explanation: [
        'Demo text: recent readings sit close to this person’s own earlier pattern.',
        'Demo text: no single indicator stands out in this example.',
      ],
    },
    anomaly: { status: 'NORMAL', reconstructionError: 0.018, threshold: 0.05 },
    inputs: { missing: [] },
  },
  'crew-02': {
    assessedAt: '2026-11-15T08:00:00Z',
    model: MOCK_MODEL,
    risk: {
      class: 'ELEVATED',
      probability: 0.64,
      explanation: [
        'Demo text: the combination of sleep duration and heart rate differs from this person’s earlier pattern.',
        'Demo text: a pattern difference is a prompt for a human review, not a finding.',
      ],
    },
    anomaly: { status: 'ANOMALY', reconstructionError: 0.083, threshold: 0.05 },
    inputs: { missing: [] },
  },
  'crew-03': {
    assessedAt: '2026-11-15T08:00:00Z',
    model: MOCK_MODEL,
    risk: null,
    anomaly: null,
    inputs: { missing: ['sleep_hours', 'blood_pressure'] },
  },
  'crew-04': { error: 'Demo: the assessment service did not answer.' },
};
