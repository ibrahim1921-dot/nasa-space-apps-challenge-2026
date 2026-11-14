'use client';

import { copy } from "@/content/ui";
import Link from 'next/link';
import { indicators } from '@/content/indicators';
import { endpoints } from '@/lib/api/endpoints';
import { valueText } from '@/lib/format';
import { useApi } from './useApi';
import OfflineBanner from './OfflineBanner';
import StatusChip from './StatusChip';
import SourceLabel from './SourceLabel';
import Sparkline from './Sparkline';
import styles from './ui.module.css';
export default function IndicatorCard({
  item,
  crewId
}) {
  const series = useApi(endpoints.readings(crewId, item.id));
  return <section className={`${styles.panel} ${styles.card}`}><div className="between"><h3><Link href={`/trends#${item.id}`}>{indicators[item.id]?.name || item.id}</Link></h3><StatusChip status={item.status} /></div><div className={styles.value}>{valueText(item.value)}<span className={styles.unit}>{item.unit}</span></div><Sparkline readings={series.data?.readings} /><p className="small muted">{item.reasons?.[0] || copy.components_IndicatorCard.no_reason_supplied_by_the_server}</p>{item.id === 'mood' && <p className="small muted">{copy.components_IndicatorCard.your_mood_answer_is_private_to}</p>}<OfflineBanner state={series} /><SourceLabel source={item.source} /></section>;
}
