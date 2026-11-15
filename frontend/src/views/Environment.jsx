'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useHealthData } from '../hooks/useHealthData.js';
import { getRadiation } from '../services/healthService.js';
import SourceLabel from '../components/SourceLabel.jsx';
import ErrorPanel from '../components/ErrorPanel.jsx';

const GCR = '#3987e5';
const SAA = '#c98500';
const TOTAL = '#d55181';

const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Station environment: daily radiation dose on the ISS and the running total. */
export default function Environment() {
  const radiation = useHealthData(getRadiation);
  const data = radiation.data;
  const days = data?.days ?? [];
  const last = days.at(-1);

  return (
    <section className="card card--lg labs" aria-labelledby="env-title" aria-busy={radiation.refreshing || undefined}>
      <div className="sleep__head">
        <div>
          <h2 id="env-title" className="view-title">
            Station environment
          </h2>
          <p className="muted">
            Daily station radiation and cumulative exposure from NASA RR-1 (ISS, 2014).
          </p>
        </div>
        {last && (
          <p className="env__total">
            <span className="num">{last.accumulated.toFixed(2)}</span> <span className="muted">mGy over {days.length} days</span>
          </p>
        )}
      </div>

      {radiation.loading && <span className="skel" style={{ width: '100%', height: 340 }} />}
      {!radiation.loading && radiation.error && <ErrorPanel onRetry={radiation.reload} />}
      {!radiation.loading && !radiation.error && days.length > 0 && (
        <>
          <h3 className="card__title labs__chart-title">
            Daily dose <span className="muted">(mGy/day)</span> and total so far <span className="muted">(mGy)</span>
          </h3>
          <div className="env__chart" role="img" aria-label={`Daily station dose stays between about 0.2 and 0.3 mGy per day; the total reaches ${last.accumulated.toFixed(2)} mGy after ${days.length} days.`}>
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={days} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} minTickGap={24} />
                <YAxis yAxisId="day" tick={{ fill: 'var(--color-muted)', fontSize: 12 }} width={44} />
                <YAxis yAxisId="total" orientation="right" tick={{ fill: 'var(--color-muted)', fontSize: 12 }} width={44} />
                <Tooltip
                  labelFormatter={shortDate}
                  formatter={(v, name) => [`${Number(v).toFixed(2)} ${name === 'Total so far' ? 'mGy' : 'mGy/day'}`, name]}
                  contentStyle={{ background: '#101a30', border: '1px solid #3c4c6a', borderRadius: 8 }}
                />
                <Legend />
                <Bar yAxisId="day" dataKey="gcr" name="Galactic cosmic rays" stackId="dose" fill={GCR} />
                <Bar yAxisId="day" dataKey="saa" name="South Atlantic Anomaly" stackId="dose" fill={SAA} />
                <Line yAxisId="total" dataKey="accumulated" name="Total so far" stroke={TOTAL} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <details><summary>Measurement details</summary><p className="labs__note">{data.note}</p></details>
        </>
      )}
      <details><summary>About radiation exposure</summary><p className="muted env__why">
        Why it matters: exposure may raise cancer risk, and on the ISS neutrons make up about 30% of total radiation.{' '}
        <a href="https://www.nasa.gov/hrp/hazards/" target="_blank" rel="noreferrer">NASA: 5 hazards of human spaceflight</a>
        {' · '}
        <a href="https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp" target="_blank" rel="noreferrer">
          CSA: monitoring radiation
        </a>
      </p></details>
      <SourceLabel source={data?.source ?? 'Environment (NASA RR-1)'} />
    </section>
  );
}
