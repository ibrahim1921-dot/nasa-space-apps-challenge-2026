// Sensor days in scoring: partial readings, the timeline, the newest-wins rule, the demo date cutoff,
// and a simulated fever end to end. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSeries } from './baseline.js';
import { SCORED_ON, scoreCheckin } from './scoring.js';
import { addDays, sensorDaysUntil } from './sensorFeed.js';
import { sensorRecords } from './sensorRecords.js';
import { buildPersonDashboard } from './personCards.js';
import { buildCrewCards, flaggedFeed } from './cmoSummary.js';
import { onOrBefore } from './demoState.js';
import { provenanceOf, rowProvenance } from './provenance.js';
import { buildHistory, buildTimeline, evaluateCheckin, usualByRow, validateReading } from './vitalsCheckin.js';
import { crewDaysOf, crewFile } from './testSupport.js';

const LAST = '2026-10-30';
const sensorsFor = (crewId, offset, events = []) =>
  sensorDaysUntil({ crewId, crewDays: crewDaysOf(crewId), untilDate: addDays(LAST, offset), demo: { events } });

const history = buildHistory(crewDaysOf('crew-01'));
const usual = usualByRow(history);
const full = () => ({
  systolic: usual.blood_pressure.mean.systolic,
  diastolic: usual.blood_pressure.mean.diastolic,
  heart_rate: Math.round(usual.heart_rate.mean),
  glucose: Math.round(usual.glucose.mean),
  temperature: usual.temperature.mean,
  sleep_hours: usual.sleep_hours.mean,
  mood: Math.round(usual.mood.mean),
});

// ---------- Partial readings ----------

test('a reading without mood scores the rest; mood is skipped, never guessed', () => {
  const all = evaluateCheckin(full(), history);
  const noMood = evaluateCheckin({ ...full(), mood: null }, history);
  assert.deepEqual(noMood.missing, ['mood']);
  assert.equal(noMood.indicators.mood, undefined);
  assert.deepEqual(noMood.order, all.order.filter((id) => id !== 'mood'));
  // Each indicator is judged on its own history, so the other rows are exactly the same.
  for (const id of noMood.order) assert.deepEqual(noMood.indicators[id], all.indicators[id], id);
});

test('a sensor gap (shirt not worn) skips blood pressure and heart rate', () => {
  const r = evaluateCheckin({ ...full(), systolic: null, diastolic: null, heart_rate: null }, history);
  assert.deepEqual(r.missing, ['blood_pressure', 'heart_rate']);
  assert.deepEqual(r.order, ['glucose', 'temperature', 'sleep_hours', 'mood']);
  const all = evaluateCheckin(full(), history);
  for (const id of r.order) assert.deepEqual(r.indicators[id], all.indicators[id], id);
});

test('a full reading has no `missing` field, so stored results keep their exact shape', () => {
  assert.equal('missing' in evaluateCheckin(full(), history), false);
});

test('validation: null = not measured; a missing key is still an error; BP is both or neither', () => {
  assert.equal(validateReading({ ...full(), mood: null }), null);
  assert.equal(validateReading({ ...full(), systolic: null, diastolic: null }), null);
  assert.match(validateReading({ ...full(), systolic: null }), /both systolic and diastolic, or neither/);
  const none = Object.fromEntries(Object.keys(full()).map((k) => [k, null]));
  assert.match(validateReading(none), /at least one reading/);
  const { glucose, ...noGlucose } = full();
  void glucose;
  assert.match(validateReading(noGlucose), /glucose .* is missing/);
  assert.match(validateReading({ ...full(), mood: null, temperature: 50 }), /expected 30–43/);
});

// ---------- Timeline ----------

test('without sensor days the timeline is exactly the old history', () => {
  const saved = [
    { recorded_at: '2026-11-02T08:00:00.000Z', ...full() },
    { recorded_at: '2026-11-01T08:00:00.000Z', ...full(), mood: 2 },
  ];
  assert.deepEqual(buildTimeline({ crewDays: crewDaysOf('crew-01'), saved }), buildHistory(crewDaysOf('crew-01'), saved));
});

test('a check-in on a date replaces that date’s sensor values; days stay in date order', () => {
  const sensors = sensorsFor('crew-01', 3);
  const saved = [{ recorded_at: '2026-11-01T07:10:00.000Z', ...full() }];
  const t = buildTimeline({ crewDays: crewDaysOf('crew-01'), sensorDays: sensors, saved });
  const after = t.slice(60);
  assert.deepEqual(after.map((d) => d.date), ['2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(after.map((d) => d.source ?? 'checkin'), ['sensor', 'checkin', 'sensor']);
  assert.deepEqual(after.map((d) => d.day), [61, 62, 63]);
  assert.equal(after[1].mood, full().mood);
});

test('a sensor record is scored exactly as a check-in of the same values would be', () => {
  const crewDays = crewDaysOf('crew-03');
  const sensors = sensorsFor('crew-03', 4);
  const records = sensorRecords({ crewId: 'crew-03', crewDays, sensorDays: sensors });
  assert.equal(records.length, 4);
  const last = records.at(-1);
  const direct = scoreCheckin({
    crewId: 'crew-03',
    reading: last.payload.reading,
    crewDays,
    sensorDays: sensors,
    at: last.recorded_at,
    scoredOn: SCORED_ON.device,
  });
  for (const k of ['status', 'indicators', 'order', 'reasons', 'needs_attention', 'missing', 'history_days']) {
    assert.deepEqual(last.payload.result[k], direct[k], k);
  }
  assert.equal(last.payload.result.missing.includes('mood'), true);
  assert.equal(evaluateSeries(buildTimeline({ crewDays, sensorDays: sensors })).length, 64);
});

// ---------- Dashboard ----------

const dash = (crewId, offset, { saved = [], events = [] } = {}) =>
  buildPersonDashboard({
    crewId,
    crewDays: crewDaysOf(crewId),
    preflight: crewFile.crew.find((c) => c.id === crewId).preflight,
    saved,
    sensorDays: sensorsFor(crewId, offset, events),
    today: addDays(LAST, offset),
  });

const checkin = (crewId, at, reading, extra = {}) => {
  const result = scoreCheckin({ crewId, reading, crewDays: crewDaysOf(crewId), at, scoredOn: SCORED_ON.device });
  return {
    id: `c-${at}`,
    crew_id: crewId,
    kind: 'daily_vitals',
    recorded_at: at,
    payload: { reading, context: null, result, ...extra },
    status: result.status,
    reasons: result.reasons,
  };
};

test('the newest of (sensor day, check-in) is the dashboard’s latest', () => {
  const c = checkin('crew-01', '2026-11-01T07:30:00.000Z', full(), {
    provenance: { systolic: 'sensor', diastolic: 'sensor', heart_rate: 'manual', glucose: 'sensor', temperature: 'sensor', sleep_hours: 'sensor', mood: 'manual' },
    entered_by: { crew_id: 'crew-01', name: 'Maya Okafor', role: 'crew' },
  });
  // Today = 1 Nov, with a check-in that day: the check-in wins over the 1 Nov sensor day.
  const today = dash('crew-01', 2, { saved: [c] });
  assert.equal(today.latest.id, c.id);
  assert.equal(today.cardsById['blood-pressure'].provenance.kind, 'sensor');
  assert.equal(today.cardsById['blood-pressure'].provenance.deviceLabel, 'shirt');
  assert.deepEqual(today.cardsById['heart-rate'].provenance, { kind: 'manual', by: 'Maya' });
  // Next day: the new sensor night is newer, and mood is not answered yet.
  const next = dash('crew-01', 3, { saved: [c] });
  assert.equal(next.latest.fromSensor, true);
  assert.equal(next.latest.payload.day.date, '2026-11-02');
  assert.equal(next.cardsById.mood.missing, true);
  assert.equal(next.cardsById.mood.missingText, 'Mood: not answered today');
  assert.equal(next.cardsById.mood.sample, false);
  assert.match(next.cardsById.sleep.sourceNote, /Simulated sensors/);
  // Sparklines include the sensor days and the check-in.
  assert.equal(next.cardsById['blood-pressure'].history.at(-1), next.latest.payload.day.systolic ?? next.cardsById['blood-pressure'].history.at(-1));
});

test('saved check-ins dated after the demo’s today are ignored until the clock reaches them, and are not changed', () => {
  const later = checkin('crew-01', '2026-11-10T07:00:00.000Z', { ...full(), mood: 1 });
  const saved = [later];
  const before = JSON.stringify(saved);
  const early = dash('crew-01', 4, { saved });
  assert.equal(early.latest.fromSensor, true, 'the future check-in is not the latest');
  assert.ok(!early.entries.some((r) => r.id === later.id));
  assert.equal(early.cardsById.mood.missing, true);
  const reached = dash('crew-01', 11, { saved });
  assert.ok(reached.entries.some((r) => r.id === later.id), 'it reappears on its date');
  assert.equal(JSON.stringify(saved), before, 'nothing deleted or changed');
  // The CMO view applies the same cut-off to its rows.
  assert.deepEqual(onOrBefore(saved, '2026-11-03'), []);
});

test('old records without provenance are treated as typed by hand, entered by the crew member', () => {
  const old = checkin('crew-01', '2026-10-31T07:00:00.000Z', full());
  const p = provenanceOf(old);
  assert.equal(p.origin, 'entered');
  assert.ok(Object.values(p.fields).every((v) => v === 'manual'));
  assert.equal(p.enteredBy.name, 'Maya Okafor');
  assert.deepEqual(rowProvenance(old, 'glucose'), { kind: 'manual', by: 'Maya' });
});

// ---------- A simulated fever, end to end ----------

test('a fever for Tomas, two days in: watch/alert with fever reasons on his dashboard and in the CMO view', () => {
  const events = [{ crewId: 'crew-02', type: 'fever', startOffset: 2 }]; // simulated on day 1, starts tomorrow
  const d = dash('crew-02', 3, { events });
  assert.ok(['watch', 'alert'].includes(d.overall.status), d.overall.status);
  const temp = d.cardsById['core-temperature'];
  assert.equal(temp.status, 'alert');
  assert.ok(temp.reasons.some((r) => /fever line/.test(r)), temp.reasons.join(' | '));

  const readings = crewFile.crew.flatMap((c) =>
    sensorRecords({ crewId: c.id, crewDays: crewDaysOf(c.id), sensorDays: sensorsFor(c.id, 3, events) }),
  );
  const crew = crewFile.crew.map((c) => ({ id: c.id, name: c.name, role: 'crew', title: c.role }));
  const cards = buildCrewCards({ crew, readings, baselines: [] });
  assert.equal(cards[0].id, 'crew-02', 'Tomas is first (worst first)');
  assert.equal(cards[0].status, 'alert');
  const feed = flaggedFeed(readings);
  const tomas = feed.filter((r) => r.crew_id === 'crew-02' && r.status === 'alert');
  assert.equal(tomas.length, 2, 'both fever days so far are in the feed');
  assert.ok(tomas.every((r) => r.reasons.some((x) => /fever line/.test(x))));

  // Without the event, the same days are quieter for Tomas.
  const calm = dash('crew-02', 3);
  assert.notEqual(calm.cardsById['core-temperature'].status, 'alert');
});
