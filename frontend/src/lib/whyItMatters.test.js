// "Why it matters in space" content: every reading shown in the app has an entry (or is knowingly listed
// in NO_WHY_TEXT), every source is 'team' or a known SRC key, and no text is empty. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_WHY_TEXT, WHY_IT_MATTERS, WHY_ID_OF, firstSentence, whatToDo, whyFor } from '../content/whyItMatters.js';
import { sourceFor } from '../content/limits.js';
import { VITALS_STEPS } from '../content/actions.js';
import { CARD_DEFS } from './personCards.js';
import { VITALS_SCREENS } from '../constants/vitals.js';
import { regionIndicators } from '../mocks/regions.js';

const STATION_TILES = ['radiation', 'cabin_co2', 'cabin_temperature', 'cabin_humidity'];
const FITNESS_ROWS = ['grip-strength', 'broad-jump-preflight', 'sit-ups-preflight'];

test('every reading shown in the app has an entry, or is listed in NO_WHY_TEXT', () => {
  const shown = new Set([
    ...CARD_DEFS.map((c) => c.id),
    ...FITNESS_ROWS,
    ...VITALS_SCREENS.map((s) => s.id),
    ...Object.values(regionIndicators).flat().map((i) => i.id),
    ...STATION_TILES,
    'stand_test',
  ]);
  for (const id of shown) {
    assert.ok(whyFor(id) || NO_WHY_TEXT.includes(id), `${id} has no "why" entry and is not listed in NO_WHY_TEXT`);
    assert.ok(!(whyFor(id) && NO_WHY_TEXT.includes(id)), `${id} is both covered and listed as missing`);
  }
  for (const key of Object.values(WHY_ID_OF)) assert.ok(WHY_IT_MATTERS[key], `WHY_ID_OF points to unknown key ${key}`);
});

test('every source is team or an existing SRC key; no text is empty', () => {
  for (const [key, e] of Object.entries(WHY_IT_MATTERS)) {
    assert.ok(e.source === 'team' || sourceFor(e.source), `${key}: unknown source ${e.source}`);
    assert.equal(typeof e.why, 'string');
    assert.ok(e.why.trim().length > 0, `${key}: empty why`);
    for (const level of ['watch', 'alert']) {
      assert.ok(Array.isArray(e[level]) && e[level].length > 0 && e[level].every((s) => s.trim()), `${key}: empty ${level}`);
    }
  }
  assert.equal(sourceFor('stahn_2017').source_short, 'Stahn 2017');
  assert.equal(sourceFor('nasa_co2_std').source_short, 'NASA-STD-3001', 'existing CO₂ source reused');
  assert.equal(sourceFor('nope'), null);
});

test('readings with their own steps keep them; the rest use the team-set pattern; cabin readings use the cabin lines', () => {
  assert.deepEqual(whatToDo('core-temperature', 'alert'), VITALS_STEPS.temperature.alert);
  assert.deepEqual(whatToDo('sleep', 'watch'), VITALS_STEPS.sleep_hours.watch);
  assert.deepEqual(whatToDo('grip-strength', 'watch'), ['Repeat the measurement at your next check-in. If it stays on watch for 2 days, tell the CMO.']);
  assert.deepEqual(whatToDo('reaction-time', 'alert'), ['Tell the CMO today. If you feel unwell now, use Emergency.']);
  assert.deepEqual(whatToDo('cabin_humidity', 'watch'), ['Tell the crew; check the CO₂ scrubber and air flow.']);
  assert.deepEqual(whatToDo('cabin_co2', 'alert'), ['Tell the CMO and mission control now.']);
  assert.deepEqual(whatToDo('mood', 'normal'), []);
});

test('firstSentence keeps only the first sentence', () => {
  assert.equal(firstSentence(whyFor('grip-strength').why), 'Without gravity, the muscles that hold you up lose strength.');
  assert.equal(firstSentence(whyFor('temperature').why), whyFor('temperature').why, 'one sentence with "1 °C" stays whole');
  assert.equal(firstSentence('No full stop'), 'No full stop');
});
