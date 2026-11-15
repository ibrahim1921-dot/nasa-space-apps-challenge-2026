// Freshness of each crew member's data on Earth. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRESHNESS_RULE, freshnessOf } from './freshness.js';

const NOW = Date.parse('2026-11-02T12:00:00.000Z');
const hoursAgo = (h) => new Date(NOW - h * 3600_000).toISOString();

test('fresh under 24 h, stale 24–48 h, no data over 48 h', () => {
  assert.equal(freshnessOf(hoursAgo(0), NOW).state, 'fresh');
  assert.equal(freshnessOf(hoursAgo(23.9), NOW).state, 'fresh');
  assert.equal(freshnessOf(hoursAgo(24), NOW).state, 'stale');
  assert.equal(freshnessOf(hoursAgo(47.9), NOW).state, 'stale');
  assert.equal(freshnessOf(hoursAgo(48), NOW).state, 'stale');
  assert.equal(freshnessOf(hoursAgo(49), NOW).state, 'no data');
});

test('no record at all is "no data"; a future arrival counts as age 0', () => {
  assert.equal(freshnessOf(null, NOW).state, 'no data');
  assert.equal(freshnessOf(null, NOW).ageHours, null);
  const f = freshnessOf(hoursAgo(-2), NOW);
  assert.equal(f.state, 'fresh');
  assert.equal(f.ageHours, 0);
});

test('text and labels; the thresholds are labelled as team-set', () => {
  assert.equal(freshnessOf(hoursAgo(5), NOW).text, 'Last record reached Earth 5 h ago');
  assert.equal(freshnessOf(hoursAgo(0.5), NOW).text, 'Last record reached Earth 30 min ago');
  assert.equal(freshnessOf(hoursAgo(72), NOW).text, 'Last record reached Earth 3 days ago');
  assert.equal(freshnessOf(hoursAgo(30), NOW).label, 'Stale');
  assert.match(FRESHNESS_RULE.label, /^Team-set/);
  assert.equal(FRESHNESS_RULE.freshHours, 24);
  assert.equal(FRESHNESS_RULE.staleHours, 48);
});
