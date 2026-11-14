'use client';

import { useEffect, useMemo, useState } from 'react';
import { useHealthData } from '../hooks/useHealthData.js';
import { getNights, scoreTonight } from '../services/healthService.js';
import { newNightId, readLoggedNights, toExtraHistory, writeLoggedNight } from '../lib/loggedNightsStore.js';
import NightCard from '../components/NightCard.jsx';
import LogNightForm from '../components/LogNightForm.jsx';
import SourceLabel from '../components/SourceLabel.jsx';
import ErrorPanel from '../components/ErrorPanel.jsx';
import LimitsInfo, { LimitGuidance } from '../components/LimitsInfo.jsx';

const COUNTED = ['normal', 'watch', 'alert'];

export default function SleepRecovery() {
  const nights = useHealthData(() => getNights());
  const [subject, setSubject] = useState('');
  const [local, setLocal] = useState([]); // this browser's logged nights for `subject`
  const [newestId, setNewestId] = useState(null);
  const [storageWarning, setStorageWarning] = useState(false);

  const subjects = nights.data?.subjects ?? [];
  const source = nights.data?.source;

  useEffect(() => {
    if (!subject && subjects.length) setSubject(subjects[0]);
  }, [subject, subjects]);

  useEffect(() => {
    if (subject) setLocal(readLoggedNights(subject));
    setNewestId(null);
  }, [subject]);

  const list = useMemo(() => {
    if (!nights.data || !subject) return [];
    const forSubject = nights.data.nights.filter((n) => n.subject_id === subject);
    const localIds = new Set(local.map((e) => e.id));
    const serverLogged = forSubject.filter((n) => n.logged && !localIds.has(n.id));
    const stored = forSubject.filter((n) => !n.logged).sort((a, b) => b.night_index - a.night_index);
    return [...local, ...serverLogged, ...stored];
  }, [nights.data, subject, local]);

  const counts = useMemo(() => {
    const c = { normal: 0, watch: 0, alert: 0, other: 0 };
    for (const n of list) c[COUNTED.includes(n.status) ? n.status : 'other'] += 1;
    return c;
  }, [list]);

  async function handleLog({ night, date }) {
    const id = newNightId();
    const result = await scoreTonight({
      subject_id: subject,
      id,
      date,
      night,
      extra_history: toExtraHistory(readLoggedNights(subject)),
    });
    const entry = {
      id: result.id,
      subject_id: subject,
      logged_at: result.logged_at,
      date: result.date,
      night,
      status: result.status,
      heart_rate_score: result.heart_rate_score,
      sleep_score: result.sleep_score,
      reason: result.reason,
      quality_issue: '',
      logged: true,
    };
    setStorageWarning(!writeLoggedNight(subject, entry));
    setLocal((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)]);
    setNewestId(entry.id);
  }

  if (nights.loading) {
    return (
      <section className="card card--lg" aria-busy="true">
        <span className="skel" style={{ width: 220, height: 22 }} />
      </section>
    );
  }
  if (nights.error) return <ErrorPanel onRetry={nights.reload} />;

  return (
    <div className="sleep">
      <section className="card card--lg sleep__intro" aria-labelledby="sleep-title">
        <div className="sleep__head">
          <div>
            <h2 id="sleep-title" className="view-title">
              Sleep &amp; recovery
            </h2>
            <p className="muted">
              Each night is compared with the same person&apos;s other clean nights. Scores above 0 mean worse than
              usual; watch and alert start at the thresholds below.
            </p>
          </div>
          <div className="field sleep__picker">
            <label htmlFor="subject" className="field__label">
              Person
            </label>
            <select id="subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ul className="sleep__summary" aria-label="Nights by status">
          <li>
            <span className="num">{list.length}</span> nights
          </li>
          <li className="status-text--normal">
            <span className="num">{counts.normal}</span> normal
          </li>
          <li className="status-text--watch">
            <span className="num">{counts.watch}</span> watch
          </li>
          <li className="status-text--alert">
            <span className="num">{counts.alert}</span> alert
          </li>
          {counts.other > 0 && (
            <li className="muted">
              <span className="num">{counts.other}</span> not scored
            </li>
          )}
        </ul>
        {nights.data?.thresholds && (
          <p className="muted sleep__thresholds">
            Heart rate: watch ≥ {nights.data.thresholds.heart_rate.watch}, alert ≥ {nights.data.thresholds.heart_rate.alert}{' '}
            · Sleep: watch ≥ {nights.data.thresholds.sleep.watch}, alert ≥ {nights.data.thresholds.sleep.alert}
          </p>
        )}
        <div className="sleep__duration">
          <p className="muted sleep__thresholds">
            Hours asleep are also checked on their own against fixed limits, shown as a separate sleep-duration status on
            each night.
          </p>
          <LimitGuidance limitKey="sleep_hours" />
          <LimitsInfo limitKey="sleep_hours" showGuidance={false} />
        </div>
        <SourceLabel source={source} />
      </section>

      <div className="sleep__layout">
        <section className="card card--lg sleep__form" aria-label="Log tonight">
          {subject && <LogNightForm subjectId={subject} onSubmit={handleLog} />}
          {storageWarning && (
            <p className="muted">This browser could not save the night, so it will be gone after a reload.</p>
          )}
          <SourceLabel source={source} />
        </section>

        <section className="sleep__list" aria-label={`Nights for ${subject}`}>
          {list.map((n) => (
            <NightCard
              key={n.id ?? `${n.subject_id}-${n.night_index}`}
              night={n}
              source={source}
              isNew={n.id === newestId}
            />
          ))}
        </section>
      </div>
    </div>
  );
}
