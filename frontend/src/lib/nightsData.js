// Server-side data access for the sleep and lab routes. Files in src/data are read, never written.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from './csv.js';
import { FEATURE_KEYS } from './nightlyScore.js';

const DATA_DIR = path.join(process.cwd(), 'src', 'data');

let cache = null;

function load() {
  if (cache) return cache;
  const scored = JSON.parse(readFileSync(path.join(DATA_DIR, 'nights_scored.json'), 'utf8'));
  const nights = parseCsv(readFileSync(path.join(DATA_DIR, 'bidsleep_nights.csv'), 'utf8'), {
    numeric: [...FEATURE_KEYS, 'hr_per_sleep_hour', 'unknown_pct', 'night_index'],
  });
  const labs = parseCsv(readFileSync(path.join(DATA_DIR, 'i4_personal_changes.csv'), 'utf8'), {
    numeric: ['day', 'value', 'range_min', 'range_max', 'base_mean', 'pooled_sd', 'change', 'z'],
    boolean: ['outside_ref_range'],
  });
  const bySubject = new Map();
  for (const row of nights) {
    if (!bySubject.has(row.subject_id)) bySubject.set(row.subject_id, []);
    bySubject.get(row.subject_id).push(row);
  }
  cache = {
    model: { pooled_spread: scored.pooled_spread, thresholds: scored.thresholds },
    scored,
    recordedBySubject: bySubject,
    subjects: [...bySubject.keys()].sort(),
    labs,
  };
  return cache;
}

export const getModel = () => load().model;
export const getScoredFile = () => load().scored;
export const getSubjects = () => load().subjects;
export const getRecordedNights = (subjectId) => load().recordedBySubject.get(subjectId) ?? [];
export const getLabs = () => load().labs;

// ---- Nights logged this session ----
// Kept in process memory as a fallback for local dev. On Vercel each request can land on a
// different instance, so the client also sends its own logged nights as `extra_history`.
const logged = new Map(); // subject_id -> [{ id, logged_at, night, result }]
const MAX_LOGGED_PER_SUBJECT = 365;

export function getLoggedNights(subjectId) {
  return logged.get(subjectId) ?? [];
}

export function saveLoggedNight(subjectId, entry) {
  const list = logged.get(subjectId) ?? [];
  list.unshift(entry);
  if (list.length > MAX_LOGGED_PER_SUBJECT) list.length = MAX_LOGGED_PER_SUBJECT;
  logged.set(subjectId, list);
}
