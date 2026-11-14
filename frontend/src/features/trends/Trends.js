'use client';

import { copy } from "@/content/ui";
import { useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { useApi } from '@/components/useApi';
import { endpoints } from '@/lib/api/endpoints';
import { indicatorIds, indicators } from '@/content/indicators';
import { valueText, dateText } from '@/lib/format';
import InfoPanel from '@/components/InfoPanel';
import OfflineBanner from '@/components/OfflineBanner';
import StatusChip from '@/components/StatusChip';
import { TrendChart } from './Charts';
function Trend({
  crewId,
  id,
  days,
  table
}) {
  const api = useApi(endpoints.readings(crewId, id, days));
  const meta = indicators[id];
  const rows = api.data?.readings || [];
  const points = rows.map(r => ({
    date: r.recordedAt.slice(5, 10),
    value: id === 'blood_pressure' ? r.value?.systolic ?? null : r.value,
    diastolic: r.value?.diastolic,
    status: r.status
  }));
  return <div id={id}><InfoPanel title={`${meta.name} · ${meta.unit}`} source={api.data?.source}><OfflineBanner state={api} />{api.loading ? <p role="status">{copy.features_trends_Trends.loading_readings}</p> : !rows.length ? <p>{copy.features_trends_Trends.no_readings_available}</p> : table ? <div className="table-wrap"><table><caption>{meta.name}{copy.features_trends_Trends.readings_over}{days}{copy.features_trends_Trends.days}</caption><thead><tr><th>{copy.features_trends_Trends.date_utc}</th><th>{copy.features_trends_Trends.value}</th><th>{copy.features_trends_Trends.status}</th></tr></thead><tbody>{rows.map(r => <tr key={r.recordedAt}><td>{dateText(r.recordedAt)}</td><td>{valueText(r.value)} {meta.unit}</td><td><StatusChip status={r.status} /></td></tr>)}</tbody></table></div> : <TrendChart data={points} usual={api.data?.usual} pressure={id === 'blood_pressure'} />}<p className="small muted">{Number.isFinite(api.data?.usual?.low) && Number.isFinite(api.data?.usual?.high) ? copy.features_trends_Trends.shaded_band_your_usual_range_supplied : copy.features_trends_Trends.your_usual_range_is_not_supplied}</p>{id === 'mood' && <p className="small muted">{copy.features_trends_Trends.your_mood_answer_is_private_to}</p>}</InfoPanel></div>;
}
export default function Trends() {
  const {
    crew
  } = useApp();
  const [days, setDays] = useState(14);
  const [table, setTable] = useState(false);
  return <><div className="page-heading"><div><p className="eyebrow">{copy.features_trends_Trends.the_bigger_picture}</p><h1>{copy.features_trends_Trends.your_patterns_over_time}</h1><p className="muted">{copy.features_trends_Trends.status_markers_reflect_the_backend_evaluation}</p></div></div><div className="chart-toolbar"><label>{copy.features_trends_Trends.history}<select value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 14, 30].map(d => <option key={d} value={d}>{d}{copy.features_trends_Trends.days}</option>)}</select></label><button aria-pressed={table} onClick={() => setTable(!table)}>{table ? copy.features_trends_Trends.show_charts : copy.features_trends_Trends.show_accessible_tables}</button></div>{crew && <div className="chart-grid">{indicatorIds.map(id => <Trend key={`${crew.id}:${id}`} id={id} crewId={crew.id} days={days} table={table} />)}</div>}</>;
}
