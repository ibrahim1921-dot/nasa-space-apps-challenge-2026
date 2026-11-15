'use client';

// The ground console's data, read through the ground source every 5 s, on the `storage` event (the
// crew app open in another tab), on the crew app's own change events (same tab), and when the tab
// becomes visible again. The source is created after mount: it reads this browser's localStorage.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { browserStorage } from '../../lib/identity.js';
import { DEMO_CHANGED_EVENT } from '../../lib/demoState.js';
import { RECORDS_CHANGED_EVENT } from '../../lib/standTestStore.js';
import { EMERGENCY_CHANGED_EVENT } from '../lib/emergencyView.js';
import { GROUND_MESSAGES_CHANGED_EVENT } from '../lib/messages.js';
import { createLocalGroundSource } from '../lib/groundSource.js';

export const REFRESH_MS = 5000;
const EVENTS = [DEMO_CHANGED_EVENT, RECORDS_CHANGED_EVENT, EMERGENCY_CHANGED_EVENT, GROUND_MESSAGES_CHANGED_EVENT, 'storage'];

export function useGroundData() {
  const [source, setSource] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    setSource(createLocalGroundSource({ storage: browserStorage() }));
    const tick = setInterval(() => {
      if (document.visibilityState !== 'hidden') refresh();
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    EVENTS.forEach((e) => window.addEventListener(e, refresh));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(tick);
      EVENTS.forEach((e) => window.removeEventListener(e, refresh));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const data = useMemo(() => {
    if (!source) return null;
    try {
      return {
        info: source.info(),
        crew: source.crewList(),
        emergencies: source.emergencies(),
        band: source.band(),
        messages: source.messages(),
        error: null,
      };
    } catch (err) {
      return { error: err?.message ?? 'Could not read the data on this device.' };
    }
  }, [source, version]);

  return { source, version, data, refresh };
}
