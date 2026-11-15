// Presentation only. All measurements, reference values, units and cadences come from Python.
export function groupByUnit(metrics) {
  const groups = new Map();
  for (const metric of metrics) {
    if (!groups.has(metric.unit)) groups.set(metric.unit, []);
    groups.get(metric.unit).push(metric);
  }
  return [...groups.entries()].map(([unit, series]) => ({ unit, series }));
}

export function number(value, unit = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const digits = unit === 'mGy' || unit === 'g/cm2' ? 4 : ['Cel', 'mmol/L', 'control'].includes(unit) ? 2 : 1;
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits }).format(value);
}

export function cadence(minutes) {
  if (minutes >= 1440) return `${minutes / 1440} ${minutes === 1440 ? 'day' : 'days'}`;
  if (minutes >= 60) return `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`;
  return `${minutes} min`;
}

export function utc(value, short = false) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short',
    ...(short ? {} : { year: 'numeric' }), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

export function chartGeometry(series) {
  const points = series.flatMap(metric => metric.points);
  if (!points.length) return null;
  const times = points.map(point => Date.parse(point.at));
  const values = points.flatMap(point => [point.value, point.original, point.activity]);
  const first = Math.min(...times), last = Math.max(...times);
  const min = Math.min(...values), max = Math.max(...values);
  const margin = Math.max((max - min) * .16, Math.abs(max) * .005, .001);
  const low = min - margin, high = max + margin;
  const x = time => 10 + (last === first ? .5 : (Date.parse(time) - first) / (last - first)) * 448;
  const y = value => 120 - (value - low) / (high - low) * 108;
  return { first, last, low, high, x, y,
    path: (rows, key) => rows.map((point, index) => `${index ? 'L' : 'M'}${x(point.at).toFixed(2)},${y(point[key]).toFixed(2)}`).join(' ') };
}
