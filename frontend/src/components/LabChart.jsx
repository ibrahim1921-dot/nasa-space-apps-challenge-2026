'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export const TIMEPOINTS = ['L-92', 'L-44', 'L-3', 'R+1', 'R+45', 'R+82', 'R+194'];
const FLIGHT_X = 2.5; // halfway between L-3 (index 2) and R+1 (index 3)

// Fixed order per crew member. Validated with the dataviz palette checker on the dark glass
// surface (#0e1830, all pairs, since lines cross): passes, with a CVD warn on aqua/yellow that
// the marker shapes and direct labels cover. Never coloured by rank.
export const CREW_STYLE = [
  { color: '#3987e5', shape: 'circle' },
  { color: '#c98500', shape: 'square' },
  { color: '#d55181', shape: 'diamond' },
  { color: '#008300', shape: 'triangle' },
];

function Marker({ cx, cy, shape, color, size = 9 }) {
  if (cx == null || cy == null) return null;
  const h = size / 2;
  const common = { fill: color, stroke: 'var(--chart-surface)', strokeWidth: 2 };
  if (shape === 'square') return <rect x={cx - h} y={cy - h} width={size} height={size} rx={1.5} {...common} />;
  if (shape === 'diamond') {
    const d = h * 1.25;
    return <path d={`M${cx} ${cy - d}L${cx + d} ${cy}L${cx} ${cy + d}L${cx - d} ${cy}Z`} {...common} />;
  }
  if (shape === 'triangle') {
    const d = h * 1.2;
    return <path d={`M${cx} ${cy - d}L${cx + d} ${cy + d * 0.8}L${cx - d} ${cy + d * 0.8}Z`} {...common} />;
  }
  return <circle cx={cx} cy={cy} r={h} {...common} />;
}

function mostCommonRange(rows) {
  const counts = new Map();
  for (const r of rows) {
    if (r.range_min == null || r.range_max == null) continue;
    const k = `${r.range_min}|${r.range_max}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (!counts.size) return null;
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const [min, max] = best.split('|').map(Number);
  return { min, max, varies: counts.size > 1 };
}

const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

function LabTooltip({ active, payload, label, units, byKey }) {
  if (!active || !payload?.length) return null;
  const tp = TIMEPOINTS[label];
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{tp}</p>
      <ul>
        {payload
          .filter((p) => p.value != null)
          .map((p) => {
            const row = byKey.get(`${p.dataKey}|${tp}`);
            const change = row ? row.value - row.base_mean : null;
            return (
              <li key={p.dataKey}>
                <span className="chart-tip__swatch" style={{ background: p.color }} aria-hidden="true" />
                <span className="chart-tip__name">{p.dataKey}</span>
                <span className="num">
                  {fmt(p.value)} {units}
                </span>
                {change !== null && (
                  <span className="muted">
                    {change >= 0 ? '+' : '−'}
                    {fmt(Math.abs(change))} vs own preflight avg
                  </span>
                )}
                {row?.outside_ref_range && <span className="chart-tip__flag">outside lab range</span>}
              </li>
            );
          })}
      </ul>
    </div>
  );
}

/** One analyte: a solid line per crew member across all timepoints, lab range shaded, flight marked. */
export default function LabChart({ rows }) {
  const { data, subjects, units, range, byKey, domain } = useMemo(() => {
    const subjectIds = [...new Set(rows.map((r) => r.subject_id))].sort();
    const keyed = new Map(rows.map((r) => [`${r.subject_id}|${r.timepoint}`, r]));
    const points = TIMEPOINTS.map((tp, x) => {
      const point = { x };
      for (const s of subjectIds) point[s] = keyed.get(`${s}|${tp}`)?.value ?? null;
      return point;
    });
    const band = mostCommonRange(rows);
    const values = rows.map((r) => r.value).filter((v) => v != null);
    if (band) values.push(band.min, band.max);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.08 || 1;
    return {
      data: points,
      subjects: subjectIds,
      units: rows[0]?.units ?? '',
      range: band,
      byKey: keyed,
      domain: [Number((lo - pad).toPrecision(3)), Number((hi + pad).toPrecision(3))],
    };
  }, [rows]);

  const lastX = (s) => {
    for (let i = data.length - 1; i >= 0; i -= 1) if (data[i][s] != null) return i;
    return -1;
  };

  return (
    <div className="labchart">
      <div className="labchart__plot">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={data} margin={{ top: 28, right: 64, bottom: 8, left: 4 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            {range && (
              <ReferenceArea
                y1={range.min}
                y2={range.max}
                fill="var(--chart-band)"
                fillOpacity={1}
                stroke="none"
                ifOverflow="extendDomain"
                label={{
                  value: `Lab range ${range.min}–${range.max}`,
                  position: 'insideTopLeft',
                  fill: 'var(--color-muted)',
                  fontSize: 12,
                }}
              />
            )}
            <ReferenceLine
              x={FLIGHT_X}
              stroke="var(--color-muted)"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{ value: 'flight', position: 'top', fill: 'var(--color-text)', fontSize: 12 }}
            />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, TIMEPOINTS.length - 1]}
              ticks={TIMEPOINTS.map((_, i) => i)}
              tickFormatter={(i) => TIMEPOINTS[i]}
              interval={0}
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--chart-axis)' }}
              tickLine={false}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              domain={domain}
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={fmt}
              label={{ value: units, angle: -90, position: 'insideLeft', fill: 'var(--color-muted)', fontSize: 12 }}
            />
            <Tooltip
              content={<LabTooltip units={units} byKey={byKey} />}
              cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="plainline"
              wrapperStyle={{ paddingTop: 8, fontSize: 13, color: 'var(--color-text)' }}
            />
            {subjects.map((s, i) => {
              const style = CREW_STYLE[i % CREW_STYLE.length];
              const end = lastX(s);
              return (
                <Line
                  key={s}
                  type="linear"
                  dataKey={s}
                  name={s}
                  stroke={style.color}
                  strokeWidth={2}
                  connectNulls
                  isAnimationActive={false}
                  dot={(props) => (
                    <Marker key={`${s}-${props.index}`} {...props} shape={style.shape} color={style.color} />
                  )}
                  activeDot={(props) => (
                    <Marker key={`${s}-a`} {...props} shape={style.shape} color={style.color} size={12} />
                  )}
                  label={(props) =>
                    props.index === end ? (
                      <text
                        key={`${s}-label`}
                        x={props.x + 10}
                        y={props.y}
                        dy={4}
                        fill="var(--color-text)"
                        fontSize={12}
                        fontWeight={600}
                      >
                        {s}
                      </text>
                    ) : null
                  }
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {range?.varies && (
        <p className="muted labchart__note">
          The lab range for this test differs by person or timepoint; the band shows the most common one. Hover a
          point to see if that reading was outside its own range.
        </p>
      )}

      <details className="labchart__table">
        <summary>Show as table</summary>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">Values by crew member and timepoint ({units})</caption>
            <thead>
              <tr>
                <th scope="col">Crew</th>
                {TIMEPOINTS.map((tp) => (
                  <th key={tp} scope="col">
                    {tp}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s}>
                  <th scope="row">{s}</th>
                  {data.map((d) => (
                    <td key={d.x} className="num">
                      {d[s] == null ? '—' : fmt(d[s])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
