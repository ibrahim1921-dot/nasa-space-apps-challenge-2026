// Per-person dashboard values. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyReaction, crewRecordLatest, latestVitalsFor } from './personDashboard.js';
import { applyVitals, applyVitalsToRegions } from './vitalsDashboard.js';
import { regionIndicators, regionStatuses } from '../mocks/regions.js';
import { applyRangeStatus } from './rangeCheck.js';
import { crewDaysOf } from './testSupport.js';

/** Everything the region drawers show for one person, as the app computes it. */
function dashboardFor(crewId, saved = null) {
  const record = crewRecordLatest(crewId, crewDaysOf(crewId));
  const latest = latestVitalsFor(record, saved);
  const show = (i) => applyReaction(applyVitals(applyRangeStatus(i), latest, null), record);
  const regions = Object.fromEntries(Object.entries(regionIndicators).map(([r, list]) => [r, list.map(show)]));
  return { record, latest, regions, statuses: applyVitalsToRegions(regionStatuses, latest) };
}

const byId = (d) => Object.fromEntries(Object.values(d.regions).flat().map((i) => [i.id, i]));

test('Maya’s and Lena’s dashboards show different values, each from their own latest crew.json day', () => {
  const maya = byId(dashboardFor('crew-01'));
  const lena = byId(dashboardFor('crew-03'));
  const mayaDay = crewDaysOf('crew-01').at(-1);
  const lenaDay = crewDaysOf('crew-03').at(-1);

  assert.equal(maya['blood-pressure'].value, `${mayaDay.systolic}/${mayaDay.diastolic}`);
  assert.equal(lena['blood-pressure'].value, `${lenaDay.systolic}/${lenaDay.diastolic}`);
  assert.equal(maya['heart-rate'].value, String(mayaDay.heartRate));
  assert.equal(lena['heart-rate'].value, String(lenaDay.heartRate));
  assert.equal(maya['reaction-time'].value, mayaDay.reactionMs);
  assert.equal(lena['reaction-time'].value, lenaDay.reactionMs);

  const differing = ['blood-pressure', 'heart-rate', 'fasting-glucose', 'reaction-time'].filter(
    (id) => maya[id].value !== lena[id].value,
  );
  assert.deepEqual(differing, ['blood-pressure', 'heart-rate', 'fasting-glucose', 'reaction-time']);
  for (const id of ['blood-pressure', 'heart-rate', 'fasting-glucose', 'reaction-time']) {
    assert.equal(maya[id].sample, false, `${id} is Maya’s own value, not sample`);
    assert.match(maya[id].sourceNote, /Synthetic crew record \(crew\.json\), 30 Oct/);
  }
});

test('everything not from crew.json or a check-in is labelled "sample"', () => {
  const maya = byId(dashboardFor('crew-01'));
  for (const id of ['blood-oxygen', 'bone-density', 'hydration', 'optic-nerve']) {
    assert.equal(maya[id].sample, true, `${id} must be labelled sample`);
  }
  const all = Object.values(maya);
  assert.ok(all.every((i) => i.sample === true || i.sample === false), 'every item says whether it is sample');
});

test('a newer check-in saved on this device replaces the crew record for that person only', () => {
  const record = crewRecordLatest('crew-01', crewDaysOf('crew-01'));
  const saved = {
    recorded_at: '2026-11-13T07:30:00.000Z',
    payload: {
      result: {
        indicators: {
          blood_pressure: { id: 'blood_pressure', value: { systolic: 141, diastolic: 92 }, status: 'alert', reasons: ['high'], usual: null },
        },
      },
    },
  };
  const maya = byId(dashboardFor('crew-01', saved));
  assert.equal(maya['blood-pressure'].value, '141/92');
  assert.equal(maya['blood-pressure'].status, 'alert');
  assert.match(maya['blood-pressure'].sourceNote, /^Your check-in/);
  assert.equal(latestVitalsFor(record, { ...saved, recorded_at: '2026-01-01T00:00:00.000Z' }), record, 'an older saved reading does not win');
  const lena = byId(dashboardFor('crew-03'));
  assert.notEqual(lena['blood-pressure'].value, '141/92');
});

test('the crew record is scored with the same check-in engine against the days before it', () => {
  const record = crewRecordLatest('crew-03', crewDaysOf('crew-03'));
  assert.equal(record.payload.result.history_days, crewDaysOf('crew-03').length - 1);
  assert.equal(record.recorded_at, `${crewDaysOf('crew-03').at(-1).date}T08:00:00.000Z`);
  assert.equal(crewRecordLatest('crew-99', []), null);
});
