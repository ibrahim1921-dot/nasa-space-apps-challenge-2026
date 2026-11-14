'use client';

import { copy } from "@/content/ui";
import { useState } from 'react';
import { useApi } from '@/components/useApi';
import { endpoints } from '@/lib/api/endpoints';
import { useMocks } from '@/lib/api/client';
import InfoPanel from '@/components/InfoPanel';
import OfflineBanner from '@/components/OfflineBanner';
import StatusChip from '@/components/StatusChip';
export default function Sleep() {
  const [subject, setSubject] = useState(useMocks ? 'demo-01' : '');
  const [input, setInput] = useState(subject);
  const api = useApi(subject ? endpoints.nights(subject) : null);
  return <><div className="page-heading"><div><p className="eyebrow">{copy.features_sleep_Sleep.rest_recovery}</p><h1>{copy.features_sleep_Sleep.a_closer_look_at_sleep}</h1><p className="muted">{copy.features_sleep_Sleep.general_human_data_physionet_healthy_adults}</p></div></div>{useMocks && <p className="notice">{copy.features_sleep_Sleep.synthetic_demonstration_of_the_physionet_view}</p>}<form className="chart-toolbar" onSubmit={e => {
      e.preventDefault();
      setSubject(input.trim());
    }}><label>{copy.features_sleep_Sleep.subject_id}<input value={input} onChange={e => setInput(e.target.value)} list="sleep-subjects" placeholder={copy.features_sleep_Sleep.enter_a_subject_id} required /></label><datalist id="sleep-subjects">{api.data?.subjects?.map(id => <option key={id} value={id} />)}</datalist><button type="submit">{copy.features_sleep_Sleep.load_subject}</button></form><OfflineBanner state={api} />{api.loading && <p role="status">{copy.features_sleep_Sleep.loading_nights}</p>}{!subject && <p>{copy.features_sleep_Sleep.enter_a_subject_id_supplied_by}</p>}{api.data && !api.data.nights?.length && <p>{copy.features_sleep_Sleep.no_nights_are_available_for_this}</p>}<div className="night-grid">{api.data?.nights?.map(night => <InfoPanel key={night.date} title={night.date} source={api.data.source}><StatusChip status={night.status} /><p className="number">{night.anomalyScore}<small>{copy.features_sleep_Sleep.anomaly_score}</small></p><p>{night.reason}</p></InfoPanel>)}</div></>;
}
