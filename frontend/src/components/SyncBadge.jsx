'use client';

import { useMemo } from 'react';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { readAllStandTests } from '../lib/standTestStore.js';
import { readAllVitals } from '../lib/vitalsCheckinStore.js';
import { SCORED_LABEL } from '../lib/scoring.js';

const TEXT = {
  on_device: 'On device',
  synced: 'Synced',
  rejected: 'Not accepted',
};

const TITLE = {
  on_device: 'Saved on this device. It is copied to the onboard server when that is reachable.',
  synced: 'Stored on the onboard server.',
  rejected: 'The onboard server did not accept this reading. It stays on this device.',
};

/** The newest saved copy of a record (sync replaces the local copy). */
export function useFreshRecord(record) {
  const { version } = useOnboard();
  return useMemo(() => {
    if (!record) return null;
    const list = record.kind === 'stand_test' ? readAllStandTests() : readAllVitals();
    return list.find((r) => r.id === record.id) ?? record;
  }, [record, version]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** "On device" / "Synced" for one saved reading, with an icon so it is not colour alone. */
export default function SyncBadge({ record, showScoredOn = false }) {
  const { syncState } = useOnboard();
  const fresh = useFreshRecord(record);
  if (!fresh) return null;
  const state = syncState(fresh);
  return (
    <span className="syncbadge-wrap">
      <span className={`syncbadge syncbadge--${state}`} title={TITLE[state]}>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
          {state === 'synced' ? (
            <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          ) : state === 'rejected' ? (
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <>
              <rect x="4" y="1.5" width="8" height="13" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="8" cy="12" r="0.9" fill="currentColor" />
            </>
          )}
        </svg>
        {TEXT[state]}
      </span>
      {showScoredOn && <span className="syncbadge__scored">{SCORED_LABEL[fresh.scored_on ?? 'server']}</span>}
      {fresh.server_differs && <span className="syncbadge__scored">Updated by the onboard server</span>}
    </span>
  );
}
