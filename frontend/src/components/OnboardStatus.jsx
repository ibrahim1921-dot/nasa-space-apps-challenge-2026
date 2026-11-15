'use client';

import { useOnboard } from '../hooks/useOnboard.jsx';

/**
 * Header strip: live backend session or demo data, backend reachability, and readings kept on this
 * device. Short wording follows the teammate change in 26f3be5.
 */
export default function OnboardStatus() {
  const { isDemo, account, server, connected, pendingCount } = useOnboard();
  const state = isDemo ? 'demo' : server === 'checking' ? 'checking' : connected ? 'connected' : 'offline';
  const label = {
    demo: 'Demo data: exploring without the backend',
    checking: 'Connecting…',
    connected: 'Backend connected',
    offline: 'Backend not reachable: readings saved on this device',
  }[state];

  return (
    <div className={`onboard onboard--${state === 'demo' ? 'mock' : state}`} role="status">
      <p className="onboard__line">
        <span className="onboard__dot" aria-hidden="true" />
        {state === 'demo' ? <strong>{label}</strong> : label}
        {state === 'connected' && account?.loginName && <span className="muted"> · signed in as {account.loginName}</span>}
        {pendingCount > 0 && (
          <span className="onboard__pending">
            {' '}· <span className="num">{pendingCount}</span> readings kept on this device
          </span>
        )}
      </p>
    </div>
  );
}
