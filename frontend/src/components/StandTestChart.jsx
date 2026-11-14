'use client';

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Highlight vs context, not categories: preflight bars are a neutral slate, this test is the
// app accent. Checked with the dataviz validator on the chart surface (#0e1830): CVD ΔE 19.7,
// normal-vision ΔE 20.4, both >= 3:1 contrast. Bars are also named on the x-axis, so colour
// is never the only cue.
const FILL = { pre: '#5d6a86', now: 'var(--color-accent)' };

const PANELS = [
  { key: 'hrRise', title: 'Heart-rate rise on standing', unit: 'bpm', value: (c) => c.heart_rate },
  { key: 'systolicDrop', title: 'Systolic BP drop on standing', unit: 'mmHg', value: (c) => -c.systolic },
];

function Tip({ active, payload, unit }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{row.label}</p>
      <p>
        <span className="num">{row.value}</span> {unit}
      </p>
    </div>
  );
}

function Panel({ panel, rows, criteria }) {
  const watch = criteria.watch[panel.key];
  const alert = criteria.alert[panel.key];
  const values = rows.map((r) => r.value);
  const lo = Math.min(0, ...values);
  const hi = Math.max(alert, ...values);
  return (
    <figure className="standchart__panel">
      <figcaption className="standchart__title">
        {panel.title} <span className="muted">({panel.unit})</span>
      </figcaption>
      <div className="standchart__plot" aria-hidden="true">
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={rows} margin={{ top: 20, right: 56, bottom: 0, left: -12 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--chart-axis)' }} tick={{ fill: 'var(--color-muted)', fontSize: 13 }} />
            <YAxis domain={[Math.floor(lo), Math.ceil(hi * 1.1)]} tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} allowDecimals={false} />
            <ReferenceLine y={0} stroke="var(--chart-axis)" />
            <ReferenceLine y={watch} stroke="var(--color-muted)" strokeDasharray="4 4" label={{ value: `watch ${watch}`, position: 'right', fill: 'var(--color-muted)', fontSize: 12 }} />
            <ReferenceLine y={alert} stroke="var(--color-muted)" strokeDasharray="4 4" label={{ value: `alert ${alert}`, position: 'right', fill: 'var(--color-muted)', fontSize: 12 }} />
            <Tooltip cursor={{ fill: 'rgba(150, 175, 230, 0.08)' }} content={<Tip unit={panel.unit} />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.label} fill={FILL[r.kind]} />
              ))}
              <LabelList dataKey="value" position="top" fill="var(--color-text)" fontSize={13} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/**
 * This test's heart-rate rise and systolic drop next to each preflight test.
 * Two panels, not one dual-axis chart: the units differ.
 */
export default function StandTestChart({ changes, preflight, criteria }) {
  if (!changes) {
    return <p className="muted">No standing reading was taken, so there is no change to compare with preflight tests.</p>;
  }
  const rowsFor = (panel) => [
    ...preflight.tests.map((p) => ({ label: p.timepoint ?? 'Preflight', value: panel.value(p.changes), kind: 'pre' })),
    { label: 'This test', value: panel.value(changes), kind: 'now' },
  ];

  return (
    <div className="standchart">
      <div className="standchart__grid">
        {PANELS.map((panel) => (
          <Panel key={panel.key} panel={panel} rows={rowsFor(panel)} criteria={criteria} />
        ))}
      </div>
      <details className="labchart__table">
        <summary>Show as a table</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Test</th>
                <th scope="col">Heart-rate rise (bpm)</th>
                <th scope="col">Systolic drop (mmHg)</th>
                <th scope="col">Diastolic drop (mmHg)</th>
              </tr>
            </thead>
            <tbody>
              {[...preflight.tests.map((p) => ({ label: p.timepoint ?? 'Preflight', c: p.changes })), { label: 'This test', c: changes }].map(
                (row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>{row.c.heart_rate}</td>
                    <td>{-row.c.systolic}</td>
                    <td>{-row.c.diastolic}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
