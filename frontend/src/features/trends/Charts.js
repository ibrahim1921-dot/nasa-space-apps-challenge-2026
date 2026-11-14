'use client';

import { copy } from "@/content/ui";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine, Legend, BarChart, Bar } from 'recharts';
const colors = ['#91a7ff', '#76d9b0', '#f6c16b', '#ff8491'];
const statusColors = {
  normal: '#76d9b0',
  watch: '#f6c16b',
  alert: '#ff8491',
  no_data: '#a1acbf'
};
const axis = {
  stroke: '#8495ae',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
  minTickGap: 22
};
function Dot({
  cx,
  cy,
  payload
}) {
  return Number.isFinite(cx) && Number.isFinite(cy) ? <circle cx={cx} cy={cy} r={4} fill={statusColors[payload.status] || colors[0]} /> : null;
}
export function TrendChart({
  data,
  usual,
  pressure = false
}) {
  return <div className="chart-box"><ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{
        top: 15,
        right: 12,
        bottom: 10,
        left: 0
      }} accessibilityLayer>
      <CartesianGrid stroke="#a3bad512" vertical={false} />
      <XAxis dataKey="date" {...axis} /><YAxis {...axis} domain={['auto', 'auto']} /><Tooltip />
      {Number.isFinite(usual?.low) && Number.isFinite(usual?.high) && <ReferenceArea y1={usual.low} y2={usual.high} fill="#76d9b0" fillOpacity={.08} label={{
          value: copy.features_trends_Charts.your_usual_range,
          fill: '#a0aec4',
          fontSize: 11
        }} />}
      <Line type="monotone" dataKey="value" name={pressure ? copy.features_trends_Charts.systolic : copy.features_trends_Charts.reading} stroke={colors[0]} strokeWidth={2} dot={<Dot />} isAnimationActive={false} />
      {pressure && <Line type="monotone" dataKey="diastolic" name={copy.features_trends_Charts.diastolic} stroke={colors[1]} dot={<Dot />} isAnimationActive={false} />}
    </LineChart>
  </ResponsiveContainer></div>;
}
export function LabChart({
  data,
  range
}) {
  // A numerical axis places flight exactly between the preflight and return draws.
  const points = data.map((row, index) => ({
    ...row,
    index
  }));
  return <div className="chart-box"><ResponsiveContainer width="100%" height="100%">
    <LineChart data={points} margin={{
        top: 25,
        right: 15,
        left: 0,
        bottom: 5
      }} accessibilityLayer>
      <CartesianGrid stroke="#a3bad512" vertical={false} />
      <XAxis type="number" dataKey="index" domain={[0, 6]} ticks={[0, 1, 2, 3, 4, 5, 6]} tickFormatter={index => data[index]?.draw || ''} {...axis} />
      <YAxis {...axis} domain={['auto', 'auto']} />
      <Tooltip labelFormatter={index => data[index]?.draw || ''} /><Legend />
      {Number.isFinite(range?.low) && Number.isFinite(range?.high) && <ReferenceArea y1={range.low} y2={range.high} fill="#76d9b0" fillOpacity={.08} />}
      <ReferenceLine x={2.5} stroke="#a0aec4" strokeDasharray="4 4" label={{
          value: copy.features_trends_Charts.flight,
          fill: '#a0aec4',
          fontSize: 12
        }} />
      {colors.map((color, i) => <Line key={color} dataKey={`crew${i + 1}`} name={`${copy.shared.crew}${i + 1}`} stroke={color} strokeWidth={2} isAnimationActive={false} />)}
    </LineChart>
  </ResponsiveContainer></div>;
}
export function RadiationChart({
  data,
  accumulated = false
}) {
  const Chart = accumulated ? LineChart : BarChart;
  return <div className="chart-box"><ResponsiveContainer width="100%" height="100%">
    <Chart data={data} accessibilityLayer>
      <CartesianGrid stroke="#a3bad512" vertical={false} />
      <XAxis dataKey="date" {...axis} /><YAxis {...axis} /><Tooltip />
      {accumulated ? <Line dataKey="accumulatedDose" name={copy.features_trends_Charts.accumulated_dose_mgy} stroke={colors[1]} strokeWidth={2} dot={false} isAnimationActive={false} /> : <Bar dataKey="dailyDose" name={copy.features_trends_Charts.daily_dose_mgyday} fill={colors[0]} radius={[4, 4, 0, 0]} isAnimationActive={false} />}
    </Chart>
  </ResponsiveContainer></div>;
}
