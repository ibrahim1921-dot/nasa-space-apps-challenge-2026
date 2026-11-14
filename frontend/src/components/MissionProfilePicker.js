'use client';

import { copy } from "@/content/ui";
import { useApp } from './AppProvider';
import { missions } from '@/content/missions';
import styles from './ui.module.css';
export default function MissionProfilePicker() {
  const {
    mission,
    chooseMission
  } = useApp();
  return <label className={styles.mission}><span>{copy.components_MissionProfilePicker.mission_profile}</span><select value={mission} onChange={e => chooseMission(e.target.value)}>{Object.entries(missions).map(([id, m]) => <option key={id} value={id}>{m.name}</option>)}</select><span>{copy.components_MissionProfilePicker._oneway_signal_delay_}{missions[mission]?.delay}</span></label>;
}
