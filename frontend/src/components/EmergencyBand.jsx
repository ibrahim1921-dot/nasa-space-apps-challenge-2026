'use client';

import { useEffect, useState } from 'react';
import { useEmergency } from '../hooks/useEmergency.jsx';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { bandText, bandVisible, canAct, cmoIsPatient, openEmergencies } from '../lib/emergency.js';
import { CMO_IS_PATIENT } from '../content/emergency.js';
import { EmergencyIcon } from './EmergencyButton.jsx';

/** Re-render every `ms` so "started 3 min ago" stays true. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * Red band on every screen while an emergency is open: the CMO sees every one; crew see their own, and
 * everyone sees one where the CMO is the patient. Records saved only on this device are shown too.
 */
export default function EmergencyBand() {
  const { all, actions, view, hidden, returnToGuide } = useEmergency();
  const { crewId, isCmo } = useOnboard();
  const now = useNow();
  const list = openEmergencies(all).filter((e) => bandVisible(e, { crewId, isCmo }));
  if (!list.length) return null;

  return (
    <div className="emg-bands" role="region" aria-label="Open emergencies">
      {list.slice(0, 3).map((e) => {
        const tucked = hidden && view?.id === e.id;
        const mine = canAct(e, { crewId, isCmo }) && (!e.reporter.crew_id || e.reporter.crew_id === crewId);
        const open = () => (tucked ? returnToGuide() : actions.show(mine ? 'guide' : 'live', e.id));
        return (
          <div key={e.id} className="emg-band">
            {e.drill && <span className="emg-band__drill">DRILL</span>}
            <button type="button" className="emg-band__button" onClick={open}>
              <EmergencyIcon size={20} />
              <span className="emg-band__text">
                {bandText(e, now)}
                {cmoIsPatient(e) && <strong className="emg-band__cmo"> {CMO_IS_PATIENT}</strong>}
              </span>
              <span className="emg-band__go">{tucked ? 'Return to emergency' : mine ? 'Open guide' : 'Open live view'}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
