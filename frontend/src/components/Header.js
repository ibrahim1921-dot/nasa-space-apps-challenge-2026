'use client';

import { copy } from "@/content/ui";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './AppProvider';
import { useMocks } from '@/lib/api/client';
import MissionProfilePicker from './MissionProfilePicker';
import styles from './ui.module.css';
const links = [['/dashboard', copy.components_Header.overview], ['/checkin', copy.components_Header.checkin], ['/trends', copy.components_Header.trends], ['/sleep', copy.components_Header.sleep], ['/labs', copy.components_Header.lab_baseline], ['/environment', copy.components_Header.environment], ['/about', copy.components_Header.about_sources]];
export default function Header() {
  const path = usePathname();
  const {
    crew
  } = useApp();
  return <header className={styles.header}><div className={styles.top}><Link href="/" className={styles.brand}><span className={styles.mark} aria-hidden="true">{copy.components_Header.label}</span>{copy.components_Header.crew_health_monitor}</Link>{useMocks && <span className={styles.demo}>{copy.components_Header.demo_data}</span>}<div className="crew-heading">{crew && <><span>{copy.components_Header.viewing_as}{crew.name}</span><Link href="/">{copy.components_Header.switch_crew_member}</Link></>}</div><MissionProfilePicker /></div><nav aria-label={copy.components_Header.main_navigation} className={styles.nav}>{links.map(([href, label]) => <Link href={href} key={href} aria-current={path === href ? 'page' : undefined}>{label}</Link>)}</nav></header>;
}
