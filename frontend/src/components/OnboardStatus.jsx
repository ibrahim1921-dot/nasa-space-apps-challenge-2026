'use client';

import { useOnboard } from '../hooks/useOnboard.jsx';

export default function OnboardStatus() {
  const { server, connected, pendingCount } = useOnboard();
  const state = server === 'mock' ? 'mock' : server === 'checking' ? 'checking' : connected ? 'connected' : 'offline';
  const label = { mock: 'Sample mission', checking: 'Connecting...', connected: 'Connected', offline: 'Offline - readings saved locally' }[state];
  return (
    <div className={`onboard onboard--${state}`} role="status">
      <p className="onboard__line">
        <span className="onboard__dot" aria-hidden="true" />
        {label}
        {pendingCount > 0 && <span className="onboard__pending"> - {pendingCount} readings awaiting sync</span>}
      </p>
    </div>
  );
}
