'use client';

// Small shared pieces for the backend-connected screens (alerts, crew, baselines, rules) and the
// labelled demo screens. Every status is an icon plus a word; colour only supports it.

const ICONS = {
  open: <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2" />,
  ack: <path d="M4 10.5 8 14l8-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  resolved: (
    <>
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M6.5 10.5 9 13l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  info: (
    <>
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10 9v5M10 6v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  warning: (
    <>
      <path d="M10 3 18 17H2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  critical: (
    <>
      <path d="M7 2.5h6L17.5 7v6L13 17.5H7L2.5 13V7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 6.5v4.5M10 13.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="9" width="12" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  flask: <path d="M8 3h4M9 3v5l-4.5 8a1 1 0 0 0 .9 1.5h9.2a1 1 0 0 0 .9-1.5L11 8V3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
};

export function Icon({ name, size = 16 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" focusable="false" className="ix-icon">
      {ICONS[name]}
    </svg>
  );
}

const STATUS = {
  OPEN: { icon: 'open', word: 'Open', tone: 'open' },
  ACKNOWLEDGED: { icon: 'ack', word: 'Acknowledged', tone: 'ack' },
  RESOLVED: { icon: 'resolved', word: 'Resolved', tone: 'resolved' },
};
const SEVERITY = {
  INFO: { icon: 'info', word: 'Info', tone: 'info' },
  WARNING: { icon: 'warning', word: 'Warning', tone: 'warning' },
  CRITICAL: { icon: 'critical', word: 'Critical', tone: 'critical' },
};

export function AlertStatus({ status }) {
  const s = STATUS[status] ?? { icon: 'info', word: status ?? 'Unknown', tone: 'info' };
  return (
    <span className={`ix-chip ix-chip--${s.tone}`}>
      <Icon name={s.icon} size={14} />
      {s.word}
    </span>
  );
}

export function Severity({ severity }) {
  const s = SEVERITY[severity] ?? { icon: 'info', word: severity ?? 'Unknown', tone: 'info' };
  return (
    <span className={`ix-chip ix-chip--sev-${s.tone}`}>
      <Icon name={s.icon} size={14} />
      {s.word}
    </span>
  );
}

/** Shown wherever the backend marks a record synthetic or nonclinical. */
export function SyntheticBadge({ show = true }) {
  if (!show) return null;
  return (
    <span className="ix-chip ix-chip--synthetic" title="The backend marks this record as synthetic and nonclinical.">
      <Icon name="flask" size={14} />
      Synthetic / not clinical
    </span>
  );
}

/** Visible label for anything that is not live backend data. */
export function DemoLabel({ children = 'Demo data' }) {
  return (
    <p className="ix-demo" role="note">
      <Icon name="flask" size={16} />
      <strong>{children}</strong>
    </p>
  );
}

/** Where a panel's data comes from: 'live' (backend), 'local' (this device / bundled), 'mock' (demo). */
export function SourceTag({ kind }) {
  const text = { live: 'Live from backend', local: 'Local simulated data', mock: 'Demo data' }[kind];
  return <span className={`ix-source ix-source--${kind}`}>{text}</span>;
}

/**
 * Loading / empty / error / permission-denied states. `error` is an ApiError (lib/api.js) or Error.
 */
export function StateMessage({ loading, error, empty, emptyText = 'Nothing to show yet.', onRetry, children }) {
  if (loading) {
    return (
      <div className="ix-state" aria-busy="true" role="status">
        <span className="skel" style={{ width: '60%', height: 16 }} />
        <span className="skel" style={{ width: '90%', height: 16 }} />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  if (error) {
    const denied = error.kind === 'forbidden';
    return (
      <div className={`ix-state ix-state--${denied ? 'denied' : 'error'}`} role="alert">
        <p className="ix-state__title">
          <Icon name={denied ? 'lock' : 'warning'} size={18} />
          {denied ? 'Not allowed' : error.kind === 'unreachable' ? 'Backend not reachable' : 'Could not load'}
        </p>
        <p>{denied ? 'Your account is not allowed to see this.' : error.message}</p>
        {onRetry && !denied && (
          <button type="button" className="btn btn--secondary" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="ix-state ix-state--empty" role="status">
        <p>{emptyText}</p>
      </div>
    );
  }
  return children ?? null;
}

const fmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const when = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? fmt.format(t) : '—';
};
