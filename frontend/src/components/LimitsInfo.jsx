import { INDICATOR_NAMES, limitsFor } from '../content/limits.js';
import { LIMIT_GROUPS, describeLimit } from '../lib/rangeCheck.js';
import StatusIcon from './StatusIcon.jsx';
import { SETTINGS } from '../lib/baseline.js';

/** "· American Heart Association" as a link, or the team-set note. */
export function LimitSource({ limit }) {
  if (limit.team_set || !limit.source_url) {
    return <span className="limits__source">Team-set, not a clinical standard</span>;
  }
  return (
    <a className="limits__source" href={limit.source_url} target="_blank" rel="noopener noreferrer" title={limit.source_title}>
      {limit.source_name}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function LimitItem({ limit }) {
  const flagged = limit.level === 'watch' || limit.level === 'alert';
  return (
    <li className="limits__item">
      <span className={`limits__rule${flagged ? ` status-text--${limit.level}` : ''}`}>
        {flagged && <StatusIcon status={limit.level} size={13} />}
        {describeLimit(limit)}
      </span>
      <span className="limits__dot" aria-hidden="true">
        ·
      </span>
      <LimitSource limit={limit} />
    </li>
  );
}

/** The guidance (target) lines for a group, e.g. the 7 h sleep target. Not a status line. */
export function LimitGuidance({ limitKey }) {
  const items = (LIMIT_GROUPS[limitKey] ?? []).flatMap(limitsFor).filter((l) => l.level === 'guidance');
  if (items.length === 0) return null;
  return (
    <ul className="limits__guidance" aria-label="Guidance">
      {items.map((l) => (
        <li key={`${l.indicator}-${l.label}`} className="limits__item">
          <span className="limits__rule">
            <span className="limits__tag">Guidance</span>
            {describeLimit(l)}
          </span>
          <span className="limits__dot" aria-hidden="true">
            ·
          </span>
          <LimitSource limit={l} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Collapsible "Limits & sources" panel for one dashboard indicator (a key of LIMIT_GROUPS).
 * Lists every watch/alert line (and test definitions) with its source; guidance is shown
 * separately so a target is never read as a status line.
 * `usual` ({ text, days } from the baseline engine) adds the personal line, e.g. "Your usual: 118/76 mmHg (last 14 days)".
 */
export default function LimitsInfo({ limitKey, open = false, showGuidance = true, usual = null }) {
  const groups = (LIMIT_GROUPS[limitKey] ?? [])
    .map((id) => ({ id, items: limitsFor(id).filter((l) => l.level !== 'guidance') }))
    .filter((g) => g.items.length);
  if (groups.length === 0) return null;
  const titled = groups.length > 1;

  return (
    <details className="limits" open={open || undefined}>
      <summary className="limits__summary">Limits &amp; sources</summary>
      <div className="limits__body">
        {groups.map((g) => (
          <div key={g.id} className="limits__group">
            {titled && <p className="limits__group-title">{INDICATOR_NAMES[g.id] ?? g.id}</p>}
            <ul className="limits__list">
              {g.items.map((l) => (
                <LimitItem key={`${l.indicator}-${l.level}-${l.rule}-${l.value}`} limit={l} />
              ))}
            </ul>
          </div>
        ))}
        {showGuidance && <LimitGuidance limitKey={limitKey} />}
        {usual && (
          <p className="limits__usual">
            <span className="limits__tag">Personal</span>
            Your usual: <span className="num">{usual.text}</span> (last {usual.days} days)
            <span className="limits__usual-note">
              {' '}
              · Watch at {SETTINGS.watchZ} SD and alert at {SETTINGS.alertZ} SD from this, in the direction that matters
            </span>
          </p>
        )}
      </div>
    </details>
  );
}
