'use client';

import { copy } from "@/content/ui";
import Link from 'next/link';
import { useApp } from './AppProvider';
import { marsMessage } from '@/content/missions';
import { usePathname } from 'next/navigation';
export default function Shell({
  children
}) {
  const {
    ready,
    crew,
    mission
  } = useApp();
  const path = usePathname();
  const needsCrew = ['/dashboard', '/checkin', '/trends'].includes(path);
  return <main id="main-content"><div className="mission-line"><span><span className="live-dot" />{copy.components_Shell.onboard_health_system}</span><span>{copy.components_Shell.crew_operations_2026}</span></div>{mission.startsWith('mars') && <aside className="notice">{marsMessage}</aside>}{!ready ? <p role="status">{copy.components_Shell.preparing_your_workspace}</p> : needsCrew && !crew ? <section className="empty"><h1>{copy.components_Shell.choose_your_crew_member}</h1><p>{copy.components_Shell.select_your_profile_to_open_your}</p><Link className="button" href="/">{copy.components_Shell.choose_crew_member}</Link></section> : children}</main>;
}
