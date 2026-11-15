export const nightDate = (night) => String(night.date ?? night.rec_start_et ?? night.logged_at ?? '').slice(0, 10);

export function sleepSummary(nights, recordingDate, period = '7') {
  const end = Date.parse(`${recordingDate}T00:00:00Z`);
  const previousDate = new Date(end - 86400000).toISOString().slice(0, 10);
  // One record per calendar day; locally entered records take precedence.
  const days = new Map();
  for (const night of nights) {
    const date = nightDate(night);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !days.has(date)) days.set(date, night);
  }
  const start = period === 'all' ? -Infinity : end - Number(period) * 86400000;
  const included = [...days.entries()].filter(([date, night]) => {
    const time = Date.parse(`${date}T00:00:00Z`);
    return time >= start && time < end && night.status !== 'data quality issue' && !night.quality_issue;
  }).map(([, night]) => night);
  const average = (key) => {
    const values = included.map((night) => night.night?.[key] ?? night[key]).filter((value) => typeof value === 'number' && Number.isFinite(value));
    return { value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, count: values.length };
  };
  return { previousDate, previous: days.get(previousDate), count: included.length, hours: average('total_sleep_h'), heartRate: average('sleep_hr_median'), awake: average('wake_pct') };
}
