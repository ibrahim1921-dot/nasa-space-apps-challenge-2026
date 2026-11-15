'use client';

import { useCallback, useRef, useState } from 'react';
import IndicatorCard from '../components/IndicatorCard.jsx';
import BodyMap from '../components/BodyMap.jsx';
import RegionDrawer from '../components/RegionDrawer.jsx';
import OverallHealthCard from '../components/OverallHealthCard.jsx';
import ContextCard from '../components/ContextCard.jsx';
import SourceLabel from '../components/SourceLabel.jsx';
import { getProfile } from '../constants/mission.js';
import { DRAWER_PINS } from '../lib/personCards.js';
import RecordObservationContexts from '../components/RecordObservationContexts.jsx';
import PersistedObservationHistory from '../components/PersistedObservationHistory.jsx';
import { useOnboard } from '../hooks/useOnboard.jsx';

/**
 * The signed-in person's dashboard. `person` comes from lib/personCards.js (buildPersonDashboard):
 * six cards, region statuses and the overall score, all from that person's own crew.json rows and
 * check-ins. Only Bones and muscles is sample.
 */
export default function Dashboard({ latestCheckin, onLogCheckin, checkinButtonRef, profileId, person }) {
  const { crewId } = useOnboard();
  const profile = getProfile(profileId);
  const regionStatuses = person.regions;

  const [openRegion, setOpenRegion] = useState(null);
  const labelRefs = useRef({});
  // Focus always returns to the region's label, even when the figure itself was clicked.
  const returnTarget = useCallback(() => labelRefs.current[openRegion], [openRegion]);

  const latest = person.latest;
  const overallState = { data: person.overall, loading: false, error: null, reload: () => {} };

  return (
    <>
      <div className="dashboard">
        <BodyMap
          statuses={regionStatuses}
          wholeBody={person.regions.wholeBody}
          openRegion={openRegion}
          onOpen={setOpenRegion}
          labelRefs={labelRefs}
          source="Recorded readings"
        />

        <div className="area-overall">
          <OverallHealthCard state={overallState} label="Computed from your latest readings" />
        </div>

        {person.cards.map((card) => (
          <div key={card.id} className={`area-${card.area}`}>
            <IndicatorCard indicator={card} profile={profile} />
          </div>
        ))}

        <div className="area-context">
          <ContextCard latestCheckin={latestCheckin} onLogCheckin={onLogCheckin} buttonRef={checkinButtonRef} />
        </div>
      </div>

      {!!person.observationHistory?.length && <details className="card observation-history"><summary>Saved check-in history</summary>
        <p className="muted">Saved on this device.</p>
        {person.observationHistory.slice(0, 10).map((record) => <article key={record.id}><time dateTime={record.recorded_at}>{new Date(record.recorded_at).toLocaleString()}</time><RecordObservationContexts record={record} /></article>)}
      </details>}
      <PersistedObservationHistory crewCode={crewId} />
      {openRegion && (
        <RegionDrawer
          regionId={openRegion}
          status={regionStatuses[openRegion]}
          latestVitals={latest}
          crewRecord={person.crewRecord}
          personal={person.cardsById}
          pinned={(DRAWER_PINS[openRegion] ?? []).map((id) => person.cardsById[id]).filter(Boolean)}
          onClose={() => setOpenRegion(null)}
          getReturnTarget={returnTarget}
          profile={profile}

        />
      )}
    </>
  );
}
