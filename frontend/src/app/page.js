'use client';

import { copy } from "@/content/ui";
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppProvider';
import { useApi } from '@/components/useApi';
import { endpoints } from '@/lib/api/endpoints';
import OfflineBanner from '@/components/OfflineBanner';
import SourceLabel from '@/components/SourceLabel';
import styles from '@/components/ui.module.css';
export default function CrewPicker() {
  const api = useApi(endpoints.crew);
  const {
    chooseCrew
  } = useApp();
  const router = useRouter();
  return <><div className="intro"><p className="eyebrow">{copy.app_page.your_health_your_mission}</p><h1>{copy.app_page.ready_for_your_next}<br /><span className="accent">{copy.app_page.small_step}</span></h1><p className="lead">{copy.app_page.track_your_health_understand_your_patterns}</p></div><div className="between"><h2>{copy.app_page.select_your_crew_profile}</h2><span className="muted small">{copy.app_page.one_click_to_get_started}</span></div><OfflineBanner state={api} />{api.loading && <p role="status">{copy.app_page.loading_crew_profiles}</p>}<div className="crew-grid">{(Array.isArray(api.data) ? api.data : []).map((person, i) => <button className={`${styles.panel} crew-card`} key={person.id} onClick={() => {
        chooseCrew(person);
        router.push('/dashboard');
      }}><span className="eyebrow">{copy.app_page.crew_0}{i + 1}</span><span className="avatar" aria-hidden="true">{person.name.split(copy.app_page.label).map(n => n[0]).join('')}</span><h2>{person.name}</h2><p className="muted">{person.role}</p><span className="enter">{copy.app_page.open_health_overview_}</span><SourceLabel source="synthetic" /></button>)}</div><p className="small muted">{copy.app_page.fictional_demo_profiles_no_password_or}</p></>;
}
