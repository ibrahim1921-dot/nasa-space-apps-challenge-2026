'use client';

import { useOnboard } from '../hooks/useOnboard.jsx';
import { getProfile } from '../constants/mission.js';

const when = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Header strip: onboard server state, what is waiting on this device, and the last copy to ground. */
export default function OnboardStatus({ profileId }) {
  const { server, connected, pendingCount, lastCopy } = useOnboard();
  const profile = getProfile(profileId);
  const state = server === 'mock' ? 'mock' : server === 'checking' ? 'checking' : connected ? 'connected' : 'offline';

  return (
    <div className={`onboard onboard--${state}`} role="status" aria-live="polite">
      <p className="onboard__line">
        <span className="onboard__dot" aria-hidden="true" />
        {state === 'checking' && 'Onboard server: checking…'}
        {state === 'mock' && (
          <>
            <strong>Demo mode</strong>: mock onboard server and bundled data
          </>
        )}
        {state === 'connected' && (
          <>
            Onboard server: <strong>connected</strong>
          </>
        )}
        {state === 'offline' && (
          <>
            <strong>Onboard server offline</strong>: saved on this device
          </>
        )}
        {pendingCount > 0 && (
          <span className="onboard__pending">
            {' '}· <span className="num">{pendingCount}</span> waiting to sync
          </span>
        )}
      </p>
      <p className="onboard__line muted">
        Last copy to ground: {lastCopy ? <time dateTime={lastCopy}>{when(lastCopy)}</time> : 'none yet from this device'}, delay{' '}
        {profile.delayText}
      </p>
    </div>
  );
}
