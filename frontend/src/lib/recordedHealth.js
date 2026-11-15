import { buildPersonDashboard, REGION_READINGS } from './personCards.js';

export const isRecordedHealth = (record) => record?.payload?.origin !== 'seed' && !record?.fromCrewRecord && !String(record?.id ?? '').startsWith('daily:') && !String(record?.id ?? '').startsWith('stand:');

export function buildRecordedDashboard({ crewId, saved = [] }) {
  const records = saved.filter((record) => record.crew_id === crewId && isRecordedHealth(record));
  const person = buildPersonDashboard({ crewId, crewDays: [], preflight: [], saved: records });
  person.cards = person.cards.map((card) => card.sample || card.value === undefined
    ? { ...card, value: null, status: 'unknown', sample: false, missing: true, history: [], trendText: '', sourceNote: null }
    : card);
  person.cardsById = Object.fromEntries(person.cards.map((card) => [card.id, card]));
  const worst = (values) => values.includes('alert') ? 'alert' : values.includes('watch') ? 'watch' : values.length ? 'normal' : 'unknown';
  person.regions = Object.fromEntries(Object.entries(REGION_READINGS).map(([region, keys]) => [region, worst(keys.map((key) => person.statuses[key]).filter(Boolean))]));
  person.regions.limbs = 'unknown';
  const count = Object.keys(person.statuses).length;
  person.overall = count ? { ...person.overall, reason: `${count} recorded indicators. Missing measurements are excluded.` } : null;
  return person;
}
