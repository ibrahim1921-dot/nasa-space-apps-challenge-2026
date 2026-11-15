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
import { sleepSummary } from '../lib/sleepSummary.js';


export default function SleepRecovery() {
  const nights = useHealthData(() => getNights());
  const [subject, setSubject] = useState('');
  const [local, setLocal] = useState([]); // this browser's logged nights for `subject`
  const [recordingDate, setRecordingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState('7');
  const [saved, setSaved] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);

  const subjects = nights.data?.subjects ?? [];
  const source = nights.data?.source;

  useEffect(() => {
    if (!subject && subjects.length) setSubject(subjects[0]);
  }, [subject, subjects]);

  useEffect(() => {
    if (subject) setLocal(readLoggedNights(subject));
    setSaved(false);
  }, [subject]);

  const list = useMemo(() => {
    if (!nights.data || !subject) return [];
    const forSubject = nights.data.nights.filter((n) => n.subject_id === subject);
    const localIds = new Set(local.map((e) => e.id));
    const serverLogged = forSubject.filter((n) => n.logged && !localIds.has(n.id));
    const stored = forSubject.filter((n) => !n.logged).sort((a, b) => b.night_index - a.night_index);
    return [...local, ...serverLogged, ...stored];
  }, [nights.data, subject, local]);

  const summary = useMemo(() => sleepSummary(list, recordingDate, period), [list, recordingDate, period]);

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
    setSaved(true);
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
            <p className="muted">Log your sleep and review your recent averages.</p>
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


        <details className="sleep__details"><summary>Scoring and data source</summary>{nights.data?.thresholds && (
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
        <SourceLabel source={source} /></details>
      </section>

      <div className="sleep__layout">
        <section className="card card--lg sleep__form" aria-label="Log tonight">
          {subject && <LogNightForm subjectId={subject} onSubmit={handleLog} onDateChange={setRecordingDate} />}
          {storageWarning && (
            <p className="muted">This browser could not save the night, so it will be gone after a reload.</p>
          )}
          {saved && <p role="status">Night saved.</p>}
        </section>

        <section className="sleep__list" aria-label="Sleep summary">
          <div className="card card--lg">
            <div className="sleep__head">
              <h3 className="card__title">Averages</h3>
              <div className="field">
                <label htmlFor="sleep-period" className="field__label">Period before {recordingDate}</label>
                <select id="sleep-period" className="input" value={period} onChange={(event) => setPeriod(event.target.value)}>
                  <option value="7">Previous 7 days</option>
                  <option value="30">Previous 30 days</option>
                  <option value="all">All earlier records</option>
                </select>
              </div>
            </div>
            <dl className="night__scores">
              {[['Sleep', summary.hours, 'h'], ['Sleeping heart rate', summary.heartRate, 'bpm'], ['Time awake', summary.awake, '%']].map(([label, metric, unit]) => (
                <div key={label}><dt>{label}</dt><dd className="num">{metric.value === null ? 'No data' : `${metric.value.toFixed(1)} ${unit}`}</dd><small className="muted">{metric.count} nights</small></div>
              ))}
            </dl>
            <p className="muted">{summary.count} recorded nights; missing days and quality issues excluded.</p>
          </div>
          <h3 className="card__title">Previous day: {summary.previousDate}</h3>
          {summary.previous ? <NightCard night={summary.previous} /> : <p className="card muted">No sleep recorded for this day.</p>}
        </section>
      </div>
    </div>
  );
}
