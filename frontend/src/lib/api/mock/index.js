import { indicators, indicatorIds, regions } from '@/content/indicators';
export const crew = [
  { id: 'crew-01', name: 'Alex Morgan', role: 'Mission commander' },
  { id: 'crew-02', name: 'Sam Rivera', role: 'Flight engineer' },
  { id: 'crew-03', name: 'Jordan Chen', role: 'Science officer' },
];
const base = [64, { systolic: 118, diastolic: 76 }, 92, 36.8, 6.4, 4];
const statuses = ['normal', 'normal', 'normal', 'normal', 'watch', 'normal'];
function evaluated(index, person = 0, value = base[index]) {
  const status = person === 1 && index === 0 ? 'alert' : person === 2 && index === 2 ? 'no_data' : statuses[index];
  return { value: status === 'no_data' ? null : value, unit: indicators[indicatorIds[index]].unit, status, reasons: [status === 'normal' ? 'Within your usual pattern in this synthetic scenario.' : status === 'no_data' ? 'No recent reading available.' : status === 'alert' ? 'A change from your personal pattern in this synthetic scenario.' : 'Sleep 6.4 h is 2.1 SD below your 14-day average of 7.1 h'], usual: { mean: typeof base[index] === 'number' ? base[index] : 118, days: 14 }, source: 'synthetic' };
}
function summary(person) {
  const values = indicatorIds.map((id, i) => ({ id, ...evaluated(i, person) }));
  const rank = { no_data: 0, normal: 1, watch: 2, alert: 3 };
  return { crewId: crew[person].id, name: crew[person].name, asOf: new Date().toISOString(), overall: person === 1 ? 'alert' : 'watch', indicators: values, bodyRegions: regions.map(r => ({ id: r.id, indicators: r.indicators, status: r.indicators.map(id => values.find(v => v.id === id).status).sort((a,b) => rank[b] - rank[a])[0] ?? 'no_data' })) };
}
export async function mockRequest(path, options = {}) {
  await new Promise(resolve => setTimeout(resolve, 120));
  const url = new URL(path, 'http://mock');
  const match = url.pathname.match(/^\/api\/crew\/([^/]+)\/(summary|readings|checkins)$/);
  if (path === '/actuator/health') return { status: 'UP' };
  if (path === '/api/crew') return structuredClone(crew);
  if (match) {
    const person = crew.findIndex(c => c.id === match[1]);
    if (person < 0) throw new Error('Crew member was not found.');
    if (match[2] === 'summary') return summary(person);
    if (match[2] === 'checkins' && options.method === 'POST') {
      const input = JSON.parse(options.body);
      return { crewId: match[1], recordedAt: input.recordedAt, overall: person === 1 ? 'alert' : 'watch', indicators: Object.fromEntries(indicatorIds.map((id,i) => [id, evaluated(i, person, input.readings[id])])), guidance: { steps: ['Repeat the measurement tonight', 'Protect your sleep window'], escalateTo: person === 1 ? 'crew_medical_officer' : null } };
    }
    if (match[2] === 'readings') {
      const indicator = url.searchParams.get('indicator'); const index = indicatorIds.indexOf(indicator);
      if (index < 0) throw new Error('Unknown indicator.');
      const days = Math.min(30, Math.max(1, Number(url.searchParams.get('days')) || 14));
      return { crewId: match[1], indicator, source: 'synthetic', readings: Array.from({ length: days }, (_, i) => {
        const date = new Date(); date.setUTCDate(date.getUTCDate() - days + 1 + i);
        const delta = Math.sin(i * 1.7 + person) * (index === 3 ? .2 : index === 4 ? .6 : index === 5 ? 0 : 4);
        const value = index === 1 ? { systolic: Math.round(118 + delta), diastolic: Math.round(76 + delta / 2) } : Number((base[index] + delta).toFixed(1));
        return { recordedAt: date.toISOString(), value: evaluated(index, person).status === 'no_data' ? null : value, status: i === days - 1 ? evaluated(index, person).status : 'normal' };
      }) };
    }
  }
  if (url.pathname === '/api/nights') return { subject: url.searchParams.get('subject'), source: 'synthetic', subjects: ['demo-01', 'demo-02', 'demo-03'], nights: Array.from({ length: 8 }, (_,i) => ({ date: `2026-11-${String(14-i).padStart(2,'0')}`, status: i === 1 ? 'watch' : i === 3 ? 'alert' : 'normal', anomalyScore: Number((.12 + (i % 4) * .21).toFixed(2)), reason: i === 1 || i === 3 ? 'Different from this subject’s usual nightly pattern.' : 'Close to this subject’s usual nightly pattern.' })) };
  if (url.pathname === '/api/labs') return { analyte: url.searchParams.get('analyte'), source: 'synthetic', unit: 'mg/dL', analytes: ['GLUCOSE'], referenceRange: { low: 70, high: 100 }, draws: ['L-92','L-44','L-3','R+1','R+45','R+82','R+194'].map((draw,i) => ({ draw, crew1: 85 + i % 3 * 5, crew2: 92 + Math.sin(i) * 8, crew3: 81 + i * 2, crew4: 96 - i })) };
  if (url.pathname === '/api/environment/radiation') return { source: 'synthetic', days: Array.from({ length: 14 }, (_,i) => ({ date: `2026-11-${String(i+1).padStart(2,'0')}`, dailyDose: Number((.2 + i % 4 * .03).toFixed(2)), accumulatedDose: Number((Array.from({length:i+1}, (_,j) => .2 + j % 4 * .03).reduce((a,b)=>a+b,0)).toFixed(2)) })) };
  throw new Error('This endpoint is not available.');
}
