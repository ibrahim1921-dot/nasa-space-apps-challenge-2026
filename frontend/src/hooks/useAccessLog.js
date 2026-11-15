'use client';

// Access log for the whole app (lib/accessLog.js): the CMO's views of other crew members' dashboards.
// Saved on this device only (no backend endpoint for it yet).

import { useCallback, useEffect, useState } from 'react';
import { useOnboard } from './useOnboard.jsx';
import { browserStorage } from '../lib/identity.js';
import { newRecordId } from '../lib/standTestStore.js';
import { addAccess, mergeLog, readLog, writeLog } from '../lib/accessLog.js';


export function useAccessLog() {
  const { crewId, isCmo } = useOnboard();
  const [local, setLocal] = useState([]);
  const [server] = useState([]); // no server copy in the monorepo yet

  useEffect(() => {
    setLocal(readLog(browserStorage()));
  }, []);

  // Device only in the monorepo: the practice app's Supabase table and /api/access-log route are not
  // ported, and the Java backend has no access-log endpoint yet. Entries stay on this device.
  const loadServer = useCallback(async () => {}, []);
  const flush = useCallback(async () => {}, []);

  useEffect(() => {
    loadServer();
    flush();
  }, [loadServer, flush]);

  /** The CMO opened another crew member's dashboard. Throttled: one entry per patient every 10 minutes. */
  const logView = useCallback(
    (patient) => {
      if (!isCmo || !crewId || !patient || patient === crewId) return;
      const storage = browserStorage();
      const { list, added } = addAccess(readLog(storage), { id: newRecordId(), viewer: crewId, patient, at: new Date().toISOString() });
      if (added) {
        writeLog(storage, list);
        setLocal(list);
      }
      flush();
    },
    [isCmo, crewId, flush],
  );

  return { entries: mergeLog(server, local), logView };
}
