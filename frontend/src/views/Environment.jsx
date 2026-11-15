'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useHealthData } from '../hooks/useHealthData.js';
import { getEnvironment } from '../services/healthService.js';
import { useMission } from '../hooks/useMission.jsx';
import { cabinDayStatus, countByStatus } from '../lib/environmentStatus.js';
import { limitOf } from '../content/limits.js';
import StatusChip from '../components/StatusChip.jsx';
import SourceLabel from '../components/SourceLabel.jsx';
import ErrorPanel from '../components/ErrorPanel.jsx';
import { WhyCard } from '../components/WhyItMatters.jsx';

const GCR = '#3987e5';
const SAA = '#c98500';
const TOTAL = '#d55181';
const CO2_MAX = '#7b93ff';
const CO2_WEEK = '#3ddc97';
const ALERT = '#ff6363';
const WATCH = '#f5b942';
const AXIS = { fill: '#a3b0c8', fontSize: 12 };
const TOOLTIP = { background: '#101a30', border: '1px solid #3c4c6a', borderRadius: 8 };

const CO2_ALERT = limitOf('cabin_co2_1h', 'alert').value;
const CO2_WATCH = limitOf('cabin_co2_7d', 'watch').value;

const shortDate = (iso) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Tile({ title, value, unit, status, note }) {
  return (
    <div className="env__tile">
      <div className="env__tile-head">
        <h3 className="env__tile-title">{title}</h3>
        {status && <StatusChip status={status} />}
      </div>
      <p className="env__tile-value">
        <span className="num">{value}</span> <span className="muted">{unit}</span>
      </p>
      <p className="muted env__tile-note">{note}</p>
    </div>
  );
}

/** Station environment: radiation dose timeline and cabin air (CO₂, temperature, humidity). */
export default function Environment() {
  const env = useHealthData(getEnvironment);
  // environment.json is ISS data (NASA RR-1); off the ISS it is labelled as a sample (lib/environmentRules.js).
  const { profile, rules } = useMission();
  const stationData = rules.stationData;
  const data = env.data;
  const [showAll, setShowAll] = useState(false);
  const [details, setDetails] = useState(false);

  const cabin = useMemo(() => (data?.cabin.days ?? []).map((d) => ({ ...d, result: cabinDayStatus(d) })), [data]);
  const counts = useMemo(() => countByStatus(data?.cabin.days ?? []), [data]);
  const radiation = data?.radiation.days ?? [];
  const lastDose = radiation.at(-1);
  const today = cabin.at(-1);
  const flagged = cabin.filter((d) => d.result.status !== 'normal').reverse();
  const listed = showAll ? cabin.slice().reverse() : flagged;

  return (
    <div className="env">
      <section className="card card--lg" aria-labelledby="env-title" aria-busy={env.refreshing || undefined}>
        <div className="sleep__head">
          <div>
            <h2 id="env-title" className="view-title">
              {stationData.title}
            </h2>
            {stationData.sample && (
              <p className="env__sample">
                <span className="chip chip--muted">{stationData.chip}</span>
                <span className="muted"> Shown for {profile.title}: no data from this habitat yet.</span>
              </p>
            )}
            <p className="muted">
              The crew&apos;s health also depends on the air and radiation around them. These are measurements from inside the
              ISS during a 2014 mission, checked against NASA&apos;s spacecraft standards.
            </p>
          </div>
        </div>

        {env.loading && <span className="skel" style={{ width: '100%', height: 140 }} />}
        {!env.loading && env.error && <ErrorPanel onRetry={env.reload} />}
        {data && today && lastDose && (
          <div className="env__tiles">
            <Tile
              title="Radiation so far"
              value={lastDose.accumulated.toFixed(2)}
              unit="mGy"
              note={`Over ${radiation.length} days, about ${(lastDose.accumulated / radiation.length).toFixed(2)} mGy a day`}
            />
            <Tile
              title="Cabin CO₂"
              value={today.co2_max_1h.toFixed(2)}
              unit="mmHg"
              status={today.result.co2.status}
              note={`Highest 1-hour average on ${shortDate(today.date)}`}
            />
            <Tile
              title="Cabin temperature"
              value={`${today.temp_min.toFixed(1)}–${today.temp_max.toFixed(1)}`}
              unit="°C"
              status={today.result.temperature.status}
              note="Range on the latest day"
            />
            <Tile
              title="Cabin humidity"
              value={`${today.rh_min.toFixed(0)}–${today.rh_max.toFixed(0)}`}
              unit="%"
              status={today.result.humidity.status}
              note="Range on the latest day"
            />
          </div>
        )}
      </section>

      {data && (
        <>
          <section className="card card--lg" aria-labelledby="co2-title">
            <h2 id="co2-title" className="card__title">
              Cabin CO₂
            </h2>
            <p className="muted">
              CO₂ builds up in a closed cabin. NASA limits the 1-hour average to {CO2_ALERT} mmHg and advises keeping the
              7-day average below {CO2_WATCH} mmHg, where crews start to report headaches.{' '}
              <span className="num">{counts.alert}</span> of {cabin.length} days had an alert and{' '}
              <span className="num">{counts.watch}</span> a watch.
            </p>
            <div
              className="env__chart"
              role="img"
              aria-label={`Daily highest 1-hour CO2 and 7-day average, with the ${CO2_ALERT} mmHg alert line and ${CO2_WATCH} mmHg watch line. ${counts.alert} of ${cabin.length} days crossed the alert line.`}
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={cabin} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="rgba(150, 175, 230, 0.1)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} minTickGap={24} />
                  <YAxis tick={AXIS} width={40} domain={[1, 4]} unit="" />
                  <Tooltip labelFormatter={shortDate} formatter={(v, name) => [`${Number(v).toFixed(2)} mmHg`, name]} contentStyle={TOOLTIP} />
                  <Legend />
                  <ReferenceLine y={CO2_ALERT} stroke={ALERT} strokeDasharray="6 4" label={{ value: `Alert ${CO2_ALERT}`, fill: ALERT, fontSize: 12, position: 'insideTopRight' }} />
                  <ReferenceLine y={CO2_WATCH} stroke={WATCH} strokeDasharray="6 4" label={{ value: `Watch ${CO2_WATCH}`, fill: WATCH, fontSize: 12, position: 'insideBottomRight' }} />
                  <Line dataKey="co2_max_1h" name="Highest 1-hour average" stroke={CO2_MAX} strokeWidth={2} dot={{ r: 2 }} />
                  <Line dataKey="co2_7d_mean" name="7-day average" stroke={CO2_WEEK} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="env__more">
            <button type="button" className="btn btn--secondary" aria-expanded={details} onClick={() => setDetails((v) => !v)}>
              {details ? 'Hide details' : `Show details: ${flagged.length} flagged days and the radiation chart`}
            </button>
          </div>

          {details && (
          <>
          <section className="card card--lg" aria-labelledby="env-why-title">
            <h2 id="env-why-title" className="card__title">
              Why it matters
            </h2>
            <div className="why__grid">
              <WhyCard id="radiation" title="Radiation" />
              <WhyCard id="cabin_co2" title="Cabin CO₂" status={today?.result.co2.status} />
              <WhyCard id="cabin_temperature" title="Cabin temperature" status={today?.result.temperature.status} />
              <WhyCard id="cabin_humidity" title="Cabin humidity" status={today?.result.humidity.status} />
            </div>
          </section>
          <section className="card card--lg" aria-labelledby="days-title">
            <div className="card__head">
              <h2 id="days-title" className="card__title">
                {showAll ? 'Every day' : 'Days that need a look'}
              </h2>
              <button type="button" className="btn btn--secondary" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show flagged days only' : `Show all ${cabin.length} days`}
              </button>
            </div>
            <ul className="env__days">
              {listed.map((d) => (
                <li key={d.date} className="env__day">
                  <div className="env__day-head">
                    <time dateTime={d.date} className="env__day-date">
                      {shortDate(d.date)}
                    </time>
                    <StatusChip status={d.result.status} icon />
                  </div>
                  {d.result.reasons.length > 0 ? (
                    <ul className="env__reasons">
                      {d.result.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted env__reasons">Inside every line and usual for this cabin.</p>
                  )}
                </li>
              ))}
            </ul>
            <p className="muted env__method">
              {data.method} Tested by planting spikes on random days: {data.evaluation.caught_pct.co2}% of +0.6 mmHg CO₂
              spikes, {data.evaluation.caught_pct.temp}% of 1.5 °C and {data.evaluation.caught_pct.rh}% of 10-point humidity
              spikes were caught, while {data.evaluation.flagged_pct_of_real_days}% of real days were flagged. {data.assumptions}
            </p>
          </section>

          <section className="card card--lg" aria-labelledby="rad-title">
            <h2 id="rad-title" className="card__title">
              Radiation dose
            </h2>
            {/* Short line first, detail on request (teammate change 26f3be5). */}
            <p className="muted">Daily station radiation and cumulative exposure from NASA RR-1 (ISS, 2014).</p>
            <details>
              <summary>About radiation exposure</summary>
              <p className="muted">
                Space radiation is invisible and one of the most hazardous parts of spaceflight; exposure may raise cancer
                risk. Daily dose is split into galactic cosmic rays (GCR) and passes through the South Atlantic Anomaly
                (SAA).
              </p>
            </details>
            <div
              className="env__chart"
              role="img"
              aria-label={`Daily station dose between about 0.2 and 0.3 mGy; ${lastDose.accumulated.toFixed(2)} mGy in total after ${radiation.length} days.`}
            >
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={radiation} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="rgba(150, 175, 230, 0.1)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} minTickGap={24} />
                  <YAxis yAxisId="day" tick={AXIS} width={44} />
                  <YAxis yAxisId="total" orientation="right" tick={AXIS} width={44} />
                  <Tooltip
                    labelFormatter={shortDate}
                    formatter={(v, name) => [`${Number(v).toFixed(2)} ${name === 'Total so far' ? 'mGy' : 'mGy/day'}`, name]}
                    contentStyle={TOOLTIP}
                  />
                  <Legend />
                  <Bar yAxisId="day" dataKey="gcr" name="Galactic cosmic rays" stackId="dose" fill={GCR} />
                  <Bar yAxisId="day" dataKey="saa" name="South Atlantic Anomaly" stackId="dose" fill={SAA} />
                  <Line yAxisId="total" dataKey="accumulated" name="Total so far" stroke={TOTAL} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="muted env__method">
              <a href="https://www.nasa.gov/hrp/hazards/" target="_blank" rel="noopener noreferrer">
                NASA: 5 hazards of human spaceflight
              </a>
              {' · '}
              <a
                href="https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp"
                target="_blank"
                rel="noopener noreferrer"
              >
                CSA: monitoring radiation for astronaut health
              </a>
            </p>
            <SourceLabel source={`${data.source}. ${data.note}`} />
          </section>
          </>
          )}
        </>
      )}
    </div>
  );
}
