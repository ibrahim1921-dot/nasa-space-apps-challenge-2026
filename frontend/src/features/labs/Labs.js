'use client';

import { copy } from "@/content/ui";
import { useState } from 'react';
import { useApi } from '@/components/useApi';
import { endpoints } from '@/lib/api/endpoints';
import { useMocks } from '@/lib/api/client';
import InfoPanel from '@/components/InfoPanel';
import OfflineBanner from '@/components/OfflineBanner';
import { LabChart } from '@/features/trends/Charts';
export default function Labs() {
  const [analyte, setAnalyte] = useState('GLUCOSE');
  const [table, setTable] = useState(false);
  const api = useApi(endpoints.labs(analyte));
  return <><div className="page-heading"><div><p className="eyebrow">{copy.features_labs_Labs.before_after_flight}</p><h1>{copy.features_labs_Labs.a_personal_baseline}</h1><p className="muted">{copy.features_labs_Labs.nasa_inspiration4_osd575_osd569}</p></div></div>{useMocks && <p className="notice">{copy.features_labs_Labs.synthetic_demonstration_of_the_nasa_bloodwork}</p>}<div className="chart-toolbar"><label>{copy.features_labs_Labs.analyte}<select value={analyte} onChange={e => setAnalyte(e.target.value)}>{(api.data?.analytes || ['GLUCOSE']).map(id => <option key={id}>{id}</option>)}</select></label><button onClick={() => setTable(!table)} aria-pressed={table}>{table ? copy.features_labs_Labs.show_chart : copy.features_labs_Labs.show_accessible_table}</button></div><OfflineBanner state={api} /><InfoPanel title={`${analyte} · ${api.data?.unit || '—'}`} source={api.data?.source || (useMocks ? 'synthetic' : 'NASA')}>{api.loading ? <p role="status">{copy.features_labs_Labs.loading_lab_baseline}</p> : api.data?.draws?.length ? table ? <div className="table-wrap"><table><caption>{copy.features_labs_Labs.seven_bloodwork_draws}</caption><thead><tr><th>{copy.features_labs_Labs.draw}</th>{[1, 2, 3, 4].map(i => <th key={i}>{copy.features_labs_Labs.crew}{i}</th>)}</tr></thead><tbody>{api.data.draws.map(row => <tr key={row.draw}><td>{row.draw}</td>{[1, 2, 3, 4].map(i => <td key={i}>{row[`crew${i}`] ?? '—'}</td>)}</tr>)}</tbody></table></div> : <LabChart data={api.data.draws} range={api.data.referenceRange} /> : <p>{copy.features_labs_Labs.no_lab_results_are_available}</p>}<p className="small muted">{copy.features_labs_Labs.general_lab_reference_ranges_not_astronaut}</p><p className="small muted">{copy.features_labs_Labs.l_days_before_launch_r_days}</p></InfoPanel></>;
}
