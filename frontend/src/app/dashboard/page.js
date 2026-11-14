'use client';

import { copy } from "@/content/ui";
import { useApp } from '@/components/AppProvider';
import { useApi } from '@/components/useApi';
import { endpoints } from '@/lib/api/endpoints';
import { dateText } from '@/lib/format';
import { indicatorIds } from '@/content/indicators';
import OfflineBanner from '@/components/OfflineBanner';
import StatusChip from '@/components/StatusChip';
import IndicatorCard from '@/components/IndicatorCard';
import BodyMap from '@/features/bodymap/BodyMap';
import Routine from '@/features/routine/Routine';
export default function Dashboard() {
  const {
    crew
  } = useApp();
  const api = useApi(crew ? endpoints.summary(crew.id) : null);
  const data = api.data;
  const cards = indicatorIds.map(id => data?.indicators?.find(i => i.id === id) || {
    id,
    value: null,
    status: 'no_data'
  });
  return <><div className="page-heading"><div><p className="eyebrow">{copy.app_dashboard_page.personal_health_overview}</p><h1>{copy.app_dashboard_page.your_mission_starts_with_you}</h1><p className="muted">{copy.app_dashboard_page.a_clear_view_of_your_body}</p></div><div className="status-box"><StatusChip status={data?.overall} /><small className="muted">{copy.app_dashboard_page.as_of}{dateText(data?.asOf)}</small></div></div><OfflineBanner state={api} />{api.loading && <p role="status">{copy.app_dashboard_page.loading_your_onboard_results}</p>}{data && <><div className="dashboard-grid"><div className="card-stack">{cards.slice(0, 3).map(item => <IndicatorCard key={item.id} item={item} crewId={crew.id} />)}</div><BodyMap summary={data} /><div className="card-stack">{cards.slice(3).map(item => <IndicatorCard key={item.id} item={item} crewId={crew.id} />)}</div></div><div className="section-gap"><Routine crewId={crew.id} /></div></>}</>;
}
