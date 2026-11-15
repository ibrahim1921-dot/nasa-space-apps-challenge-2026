// CMO exams in a crew member's timeline: one entry per date, measured fields overlaid in time order,
// and the dashboard shows the merged day. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, evaluateCheckin } from './vitalsCheckin.js';
import { SCORED_ON, scoreCheckin } from './scoring.js';
import { addDays, sensorDaysUntil } from './sensorFeed.js';
import { examView, sensorRecords } from './sensorRecords.js';
import { buildPersonDashboard } from './personCards.js';
import { evaluateSeries } from './baseline.js';
import { crewDaysOf, crewFile, testUuid } from './testSupport.js';

const LAST = '2026-10-30';
const D = addDays(LAST, 4); // 2026-11-03, a sensor day
const NULLS = { systolic: null, diastolic: null, heart_rate: null, glucose: null, temperature: null, sleep_hours: null, mood: null };
const FULL = { systolic: 118, diastolic: 77, heart_rate: 62, glucose: 90, temperature: 36.8, sleep_hours: 7.2, mood: 4 };
const LENA = { crew_id: 'crew-03', name: 'Lena Kowalski', role: 'cmo' };

const sensorsFor = (crewId, offset) => sensorDaysUntil({ crewId, crewDays: crewDaysOf(crewId), untilDate: addDays(LAST, offset) });
const exam = (at, values) => ({ recorded_at: at, kind_detail: 'cmo_exam', ...NULLS, ...values });
const checkin = (at, values = {}) => ({ recorded_at: at, ...FULL, ...values });
const dayOf = (t, date) => t.filter((d) => d.date === date);
const datesAfter = (t) => t.slice(60).map((d) => d.date);

test('an exam with only temperature changes temperature and keeps the sensor heart rate', () => {
  const crewDays = crewDaysOf('crew-02');
  const sensors = sensorsFor('crew-02', 4);
  const plain = buildTimeline({ crewDays, sensorDays: sensors });
  const merged = buildTimeline({ crewDays, sensorDays: sensors, saved: [exam(`${D}T14:02:00.000Z`, { temperature: 38.4 })] });
  assert.equal(merged.length, plain.length, 'no extra entry');
  const [before] = dayOf(plain, D);
  const [after] = dayOf(merged, D);
  assert.equal(after.temperature, 38.4);
  assert.equal(after.heartRate, before.heartRate);
  assert.equal(after.systolic, before.systolic);
  assert.equal(after.source, 'sensor');
  assert.equal(after.provenance.temperature, 'cmo_exam');
  assert.equal(after.provenance.heart_rate, before.provenance.heart_rate);
  assert.deepEqual(after.exams.map((x) => x.fields), [['temperature']]);
  // The feed's sensor day is not changed in place.
  assert.notEqual(sensors.find((d) => d.date === D).provenance.temperature, 'cmo_exam');
});

test('check-in before exam: the exam overrides only its fields of that check-in', () => {
  const crewDays = crewDaysOf('crew-01');
  const saved = [checkin(`${D}T08:00:00.000Z`), exam(`${D}T14:00:00.000Z`, { temperature: 38.4, heart_rate: 96 })];
  const t = buildTimeline({ crewDays, sensorDays: sensorsFor('crew-01', 4), saved });
  const [day] = dayOf(t, D);
  assert.equal(dayOf(t, D).length, 1);
  assert.equal(day.temperature, 38.4);
  assert.equal(day.heartRate, 96);
  assert.equal(day.systolic, FULL.systolic);
  assert.equal(day.mood, FULL.mood);
  assert.equal(day.source, undefined, 'the check-in is the base, the sensor day stays replaced');
});

test('exam before check-in: the later check-in wins for its fields; the exam fills only what it left null', () => {
  const crewDays = crewDaysOf('crew-01');
  const saved = [
    exam(`${D}T07:30:00.000Z`, { temperature: 38.4, glucose: 140 }),
    checkin(`${D}T09:00:00.000Z`, { temperature: 36.9, glucose: null }),
  ];
  const t = buildTimeline({ crewDays, sensorDays: sensorsFor('crew-01', 4), saved });
  const [day] = dayOf(t, D);
  assert.equal(dayOf(t, D).length, 1);
  assert.equal(day.temperature, 36.9);
  assert.equal(day.glucose, 140);
  assert.deepEqual(day.exams[0].fields, ['glucose']);
  assert.deepEqual(day.provenance, { glucose: 'cmo_exam' });
});

test('two exams on one day are applied in time order, on one entry', () => {
  const crewDays = crewDaysOf('crew-02');
  const sensors = sensorsFor('crew-02', 4);
  const saved = [
    exam(`${D}T15:00:00.000Z`, { temperature: 38.6, heart_rate: 95 }), // given out of order on purpose
    exam(`${D}T10:00:00.000Z`, { temperature: 38.0 }),
  ];
  const t = buildTimeline({ crewDays, sensorDays: sensors, saved });
  const [day] = dayOf(t, D);
  assert.equal(dayOf(t, D).length, 1);
  assert.equal(day.temperature, 38.6);
  assert.equal(day.heartRate, 95);
  assert.deepEqual(day.exams.map((x) => x.recorded_at), [`${D}T10:00:00.000Z`, `${D}T15:00:00.000Z`]);
});

test('an exam on a date with no sensor day or check-in is one partial entry', () => {
  const crewDays = crewDaysOf('crew-02');
  const t = buildTimeline({ crewDays, saved: [exam(`${D}T14:00:00.000Z`, { temperature: 38.4 }), exam(`${D}T16:00:00.000Z`, { heart_rate: 99 })] });
  assert.equal(t.length, crewDays.length + 1);
  const last = t.at(-1);
  assert.equal(last.date, D);
  assert.equal(last.day, crewDays.at(-1).day + 1);
  assert.equal(last.temperature, 38.4);
  assert.equal(last.heartRate, 99);
  assert.equal(last.systolic, null);
  assert.equal(last.mood, null);
  assert.equal(last.examOnly, true);
});

test('the baseline still sees one value per date, and full check-ins behave exactly as before', () => {
  const crewDays = crewDaysOf('crew-01');
  const sensors = sensorsFor('crew-01', 6);
  const checkins = [checkin(`${addDays(LAST, 2)}T08:00:00.000Z`), checkin(`${addDays(LAST, 5)}T08:00:00.000Z`, { mood: 2 })];
  const exams = [
    exam(`${addDays(LAST, 2)}T13:00:00.000Z`, { temperature: 37.9 }),
    exam(`${addDays(LAST, 3)}T13:00:00.000Z`, { heart_rate: 88 }),
    exam(`${addDays(LAST, 6)}T13:00:00.000Z`, { glucose: 101 }),
  ];
  const plain = buildTimeline({ crewDays, sensorDays: sensors, saved: checkins });
  const merged = buildTimeline({ crewDays, sensorDays: sensors, saved: [...checkins, ...exams] });
  assert.deepEqual(datesAfter(merged), datesAfter(plain));
  assert.equal(new Set(datesAfter(merged)).size, datesAfter(merged).length, 'one entry per date');
  // Days the exams did not touch are identical; touched days differ only in the exam's fields.
  const changed = new Set(exams.map((e) => e.recorded_at.slice(0, 10)));
  for (let i = 0; i < plain.length; i += 1) {
    if (!changed.has(plain[i].date)) assert.deepEqual(merged[i], plain[i], plain[i].date);
  }
  // A check-in scored with no exams around is unchanged by this feature.
  const at = `${addDays(LAST, 7)}T08:00:00.000Z`;
  const direct = scoreCheckin({ crewId: 'crew-01', reading: FULL, crewDays, saved: checkins, sensorDays: sensors, at, scoredOn: SCORED_ON.device });
  const expected = evaluateCheckin(FULL, buildTimeline({ crewDays, sensorDays: sensors, saved: checkins.map(({ recorded_at, ...r }) => ({ recorded_at, ...r })) }));
  assert.deepEqual(direct.indicators, expected.indicators);
});

test('an exam is scored as the merged day, exactly as the dashboard timeline scores that day', () => {
  const crewDays = crewDaysOf('crew-02');
  const sensors = sensorsFor('crew-02', 4);
  const at = `${D}T14:02:00.000Z`;
  const reading = { ...NULLS, temperature: 38.4 };
  const scored = scoreCheckin({ crewId: 'crew-02', reading, crewDays, sensorDays: sensors, at, scoredOn: SCORED_ON.device, kindDetail: 'cmo_exam' });
  assert.deepEqual(scored.reading, reading, 'the exam keeps only what was measured');
  assert.equal(scored.day_reading.temperature, 38.4);
  assert.equal(scored.day_reading.heart_rate, sensors.at(-1).heartRate);
  assert.ok(scored.order.includes('heart_rate') && scored.order.includes('temperature'));

  const record = { id: testUuid(), crew_id: 'crew-02', kind: 'daily_vitals', recorded_at: at, payload: { reading, kind_detail: 'cmo_exam', entered_by: LENA, provenance: { temperature: 'cmo_exam' }, result: scored } };
  const day = sensorRecords({ crewId: 'crew-02', crewDays, sensorDays: sensors, saved: [record] }).at(-1);
  for (const k of ['status', 'indicators', 'order', 'reasons', 'needs_attention', 'missing', 'history_days']) {
    assert.deepEqual(day.payload.result[k], scored[k], k);
  }
  assert.equal(evaluateSeries(buildTimeline({ crewDays, sensorDays: sensors })).length, crewDays.length + 4);
});

test('Tomas’s dashboard: temperature alert labelled "Exam by Lena (CMO)", sensor heart rate unchanged', () => {
  const crewDays = crewDaysOf('crew-02');
  const sensors = sensorsFor('crew-02', 4);
  const at = `${D}T14:02:00.000Z`;
  const reading = { ...NULLS, temperature: 38.4 };
  const result = scoreCheckin({ crewId: 'crew-02', reading, crewDays, sensorDays: sensors, at, scoredOn: SCORED_ON.device, kindDetail: 'cmo_exam' });
  const record = { id: testUuid(), crew_id: 'crew-02', kind: 'daily_vitals', recorded_at: at, payload: { reading, context: null, kind_detail: 'cmo_exam', entered_by: LENA, provenance: { temperature: 'cmo_exam' }, result }, status: result.status, reasons: result.reasons };
  const preflight = crewFile.crew.find((c) => c.id === 'crew-02').preflight;
  const plain = buildPersonDashboard({ crewId: 'crew-02', crewDays, preflight, sensorDays: sensors, today: D });
  const dash = buildPersonDashboard({ crewId: 'crew-02', crewDays, preflight, saved: [record], sensorDays: sensors, today: D });

  const temp = dash.cardsById['core-temperature'];
  assert.equal(temp.value, '38.4');
  assert.equal(temp.status, 'alert');
  assert.deepEqual(temp.provenance, { kind: 'exam', by: 'Lena', role: 'CMO' });
  const hr = dash.cardsById['heart-rate'];
  assert.equal(hr.value, plain.cardsById['heart-rate'].value);
  assert.equal(hr.provenance.kind, 'sensor');
  assert.equal(dash.entries.length, plain.entries.length, 'the exam adds no day of its own');
  assert.equal(examView({ crewDays, sensorDays: sensors, saved: [record] }).hidden.has(record.id), true);
});

test('a check-in with an exam merged in shows both: its own values entered by the crew member, exam values by the CMO', () => {
  const crewDays = crewDaysOf('crew-01');
  const sensors = sensorsFor('crew-01', 4);
  const maya = { crew_id: 'crew-01', name: 'Maya Okafor', role: 'crew' };
  const ci = { id: testUuid(), crew_id: 'crew-01', kind: 'daily_vitals', recorded_at: `${D}T08:00:00.000Z`, payload: { reading: FULL, context: null, entered_by: maya, provenance: Object.fromEntries(Object.keys(FULL).map((k) => [k, 'manual'])), result: {} } };
  const ex = { id: testUuid(), crew_id: 'crew-01', kind: 'daily_vitals', recorded_at: `${D}T14:00:00.000Z`, payload: { reading: { ...NULLS, temperature: 38.4 }, kind_detail: 'cmo_exam', entered_by: LENA, provenance: { temperature: 'cmo_exam' }, result: {} } };
  const view = examView({ crewDays, sensorDays: sensors, saved: [ci, ex] });
  assert.equal(view.hidden.has(ex.id), true);
  const shown = view.overrides.get(ci.id);
  assert.equal(shown.payload.reading.temperature, 38.4);
  assert.equal(shown.payload.reading.mood, FULL.mood);
  assert.equal(shown.payload.provenance.temperature, 'cmo_exam');
  assert.equal(shown.payload.provenance.mood, 'manual');
});
