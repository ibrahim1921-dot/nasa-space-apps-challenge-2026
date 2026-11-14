'use client';

import { copy } from "@/content/ui";
import { useState } from 'react';
import { useApi } from '@/components/useApi';
import { endpoints } from '@/lib/api/endpoints';
import { useMocks } from '@/lib/api/client';
import InfoPanel from '@/components/InfoPanel';
import OfflineBanner from '@/components/OfflineBanner';
import { RadiationChart } from '@/features/trends/Charts';
export default function Environment() {
  const api = useApi(endpoints.radiation);
  const [table, setTable] = useState(false);
  return <><div className="page-heading"><div><p className="eyebrow">{copy.features_environment_Environment.the_world_around_your_crew}</p><h1>{copy.features_environment_Environment.your_onboard_environment}</h1><p className="muted">{copy.features_environment_Environment.environment_iss_station_dose_nasa_rr1}</p></div></div>{useMocks && <p className="notice">{copy.features_environment_Environment.synthetic_demonstration_of_the_environment_view}</p>}<div className="chart-toolbar"><button aria-pressed={table} onClick={() => setTable(!table)}>{table ? copy.features_environment_Environment.show_charts : copy.features_environment_Environment.show_accessible_table}</button></div><OfflineBanner state={api} />{api.loading && <p role="status">{copy.features_environment_Environment.loading_station_readings}</p>}{api.data && !api.data.days?.length && <p>{copy.features_environment_Environment.no_environment_readings_are_available}</p>}{api.data?.days?.length > 0 && (table ? <InfoPanel title={copy.features_environment_Environment.station_dose_history} source={api.data.source}><div className="table-wrap"><table><caption>{copy.features_environment_Environment.iss_station_radiation_dose}</caption><thead><tr><th>{copy.features_environment_Environment.date}</th><th>{copy.features_environment_Environment.daily_mgyday}</th><th>{copy.features_environment_Environment.accumulated_mgy}</th></tr></thead><tbody>{api.data.days.map(d => <tr key={d.date}><td>{d.date}</td><td>{d.dailyDose}</td><td>{d.accumulatedDose}</td></tr>)}</tbody></table></div></InfoPanel> : <div className="chart-grid"><InfoPanel title={copy.features_environment_Environment.daily_dose_mgyday} source={api.data.source}><RadiationChart data={api.data.days} /></InfoPanel><InfoPanel title={copy.features_environment_Environment.accumulated_dose_mgy} source={api.data.source}><RadiationChart data={api.data.days} accumulated /></InfoPanel></div>)}<div className="section-gap"><InfoPanel title={copy.features_environment_Environment.radiation_in_space} source="NASA"><p>{copy.features_environment_Environment.invisible_and_considered_one_of_the}</p><a href="https://www.nasa.gov/hrp/hazards/">{copy.features_environment_Environment.nasa_hazards_}</a><p><a href="https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp">{copy.features_environment_Environment.csa_radiation_monitoring_}</a></p></InfoPanel></div></>;
}
