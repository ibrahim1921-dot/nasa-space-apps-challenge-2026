import StatusIcon from './StatusIcon.jsx';
import SourceLabel from './SourceLabel.jsx';
import ObservationContext from './ObservationContext.jsx';
import { STATUS_LABELS } from '../constants/status.js';
import { rangeStatus } from '../lib/rangeCheck.js';

const SCORED = new Set(['normal', 'watch', 'alert']);

function formatDate(night) {
  if (night.logged) {
    const when = night.date ?? night.logged_at?.slice(0, 10);
    return when ? `Logged · ${when}` : 'Logged tonight';
  }
  // rec_start_et is local US Eastern time; show the calendar date the night started.
  const [date, time] = String(night.rec_start_et ?? '').split(' ');
  return time ? `${date} · ${time.slice(0, 5)}` : date;
}

const fmtScore = (v) => (v === null || v === undefined ? '—' : v.toFixed(2));

/** One night: date, status, heart-rate and sleep scores, and the reason in plain words. */
export default function NightCard({ night, source, isNew = false }) {
  const scored = SCORED.has(night.status);
  const label = night.status === 'data quality issue' ? 'Data quality issue' : 'Not enough history';
  // Fixed sleep-duration check, kept separate from the personal (z-score) night status.
  const hours = night.total_sleep_h ?? night.night?.total_sleep_h ?? null;
  const duration = typeof hours === 'number' ? rangeStatus('sleep_hours', hours) : null;

  return (
    <article className={`card night${scored ? '' : ' night--muted'}${isNew ? ' night--new' : ''}`}>
      <header className="night__top">
        <div>
          <p className="night__date num">{formatDate(night)}</p>
          {!night.logged && <p className="muted night__index">Night {night.night_index}</p>}
        </div>
        {scored ? (
          <span className={`chip chip--${night.status}`}>
            <StatusIcon status={night.status} />
            {STATUS_LABELS[night.status]}
          </span>
        ) : (
          <span className="chip chip--muted">{label}</span>
        )}
      </header>

      <dl className="night__scores">
        <div>
          <dt>Heart-rate score</dt>
          <dd className="num">{fmtScore(night.heart_rate_score)}</dd>
        </div>
        <div>
          <dt>Sleep score</dt>
          <dd className="num">{fmtScore(night.sleep_score)}</dd>
        </div>
        {duration && (
          <div>
            <dt>Sleep duration</dt>
            <dd className="night__duration">
              <span className="num">{hours.toFixed(1)} h</span>
              <span className={`status-text--${duration.status} night__duration-status`}>
                <StatusIcon status={duration.status} size={13} />
                {STATUS_LABELS[duration.status]}
              </span>
            </dd>
          </div>
        )}
      </dl>

      {night.reason && <p className="night__reason">{night.reason}</p>}
      {!scored && night.quality_issue && <p className="night__reason muted">Not scored: {night.quality_issue}.</p>}
      {night.status === 'not enough history' && (
        <p className="night__reason muted">Needs at least 2 other clean nights from this person.</p>
      )}
      <ObservationContext context={night.observationContext || { activityContext: 'SLEEPING', contextOrigin: 'MEASUREMENT_TYPE', sourceKind: night.logged ? 'SELF_REPORT' : source ? 'IMPORT' : 'UNKNOWN', recordedAt: night.logged_at || null }} />
      <SourceLabel source={source} />
    </article>
  );
}
