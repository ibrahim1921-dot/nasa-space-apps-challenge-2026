// Small shared pieces of the ground console. Icons are decorative and always paired with words.

import { timesText } from '../lib/delay.js';

const svg = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  'aria-hidden': 'true',
  focusable: 'false',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export function Icon({ name, size = 14 }) {
  switch (name) {
    case 'fresh':
      return (
        <svg {...svg(size)}>
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
      );
    case 'stale':
      return (
        <svg {...svg(size)}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5V8l2.5 1.5" />
        </svg>
      );
    case 'no data':
      return (
        <svg {...svg(size)}>
          <circle cx="8" cy="8" r="6" />
          <path d="M5 8h6" />
        </svg>
      );
    case 'warning':
      return (
        <svg {...svg(size)}>
          <path d="M8 1.8 15 14H1z" />
          <path d="M8 6.5v3.2M8 11.8v.1" />
        </svg>
      );
    case 'transit':
      return (
        <svg {...svg(size)}>
          <path d="M2 8h9M8 4.5 11.5 8 8 11.5" />
          <path d="M14 3v10" />
        </svg>
      );
    case 'delivered':
      return (
        <svg {...svg(size)}>
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
      );
    case 'read':
      return (
        <svg {...svg(size)}>
          <path d="M1.5 8.5 5 12l6.5-7.5M7.5 11l1 1L15 4.5" />
        </svg>
      );
    case 'ended':
      return (
        <svg {...svg(size)}>
          <rect x="3" y="3" width="10" height="10" rx="2" />
        </svg>
      );
    default:
      return null;
  }
}

/** Freshness as icon + word, with the age in plain text. */
export function FreshnessChip({ freshness, showText = true }) {
  const cls = freshness.state.replace(' ', '-');
  return (
    <span className="gr-fresh">
      <span className={`gr-tag gr-tag--${cls}`}>
        <Icon name={freshness.state} />
        {freshness.label}
      </span>
      {showText && <span className="gr-muted">{freshness.text}</span>}
    </span>
  );
}

/** "Recorded 14:02 onboard · reached Earth 14:22 (UTC)" */
export function TimesLine({ recordedAt, profile }) {
  if (!recordedAt) return <span className="gr-muted">No record yet</span>;
  return (
    <span className="gr-times">
      {timesText(recordedAt, profile)}
      <span className="gr-muted"> · arrival estimated from the signal delay</span>
    </span>
  );
}

const pad = (n) => String(n).padStart(2, '0');
/** "14 Nov 14:02 UTC" */
export function utcText(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
