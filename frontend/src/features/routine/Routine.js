'use client';

import { copy } from "@/content/ui";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { routineDays, markRoutine, streak } from './storage';
import { pendingCheckins } from '@/lib/cache/queue';
import { writeStorage } from '@/lib/cache';
import { dayKey } from '@/lib/format';
import InfoPanel from '@/components/InfoPanel';
export default function Routine({
  crewId
}) {
  const [days, setDays] = useState([]);
  const [queue, setQueue] = useState([]);
  useEffect(() => {
    const update = () => {
      setDays(routineDays(crewId));
      setQueue(pendingCheckins().filter(e => e.crewId === crewId));
    };
    const timer = setTimeout(update, 0);
    const interval = setInterval(update, 5000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [crewId]);
  const today = days.find(d => d.day === dayKey()) || {};
  return <InfoPanel title={copy.features_routine_Routine.todays_routine}><div className="between"><p className="muted">{copy.features_routine_Routine.small_steps_every_day}</p><span className="streak">{streak(days)}{copy.features_routine_Routine.day_streak}</span></div><div className="routine-row"><span>{today.checkin ? '✓' : '○'}{copy.features_routine_Routine.morning_checkin}</span><Link href="/checkin">{today.checkin ? copy.features_routine_Routine.view_checkin : copy.features_routine_Routine.start_}</Link></div><label className="routine-row"><span>{copy.features_routine_Routine.evening_sleep_log}</span><input type="checkbox" checked={Boolean(today.sleep)} onChange={e => {
        const updated = markRoutine(crewId, 'sleep');
        updated.find(d => d.day === dayKey()).sleep = e.target.checked;
        writeStorage(`chm:routine:${crewId}`, updated);
        setDays([...updated]);
      }} /></label>{!today.checkin && <p className="notice">{copy.features_routine_Routine.a_moment_for_yourself_complete_todays}</p>}{queue.map(entry => <p role="status" key={entry.id}>{entry.status === 'pending' ? copy.features_routine_Routine.waiting_to_send : `${copy.shared.checkin_attention}${entry.error}`}</p>)}<p className="small muted">{copy.features_routine_Routine.streaks_celebrate_completed_checkins_never_health}</p></InfoPanel>;
}
