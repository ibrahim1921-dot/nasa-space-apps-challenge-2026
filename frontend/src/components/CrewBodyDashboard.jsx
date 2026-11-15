'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { DRAWER_PINS } from '../lib/personCards.js';
import { buildRecordedDashboard } from '../lib/recordedHealth.js';
import { getProfile } from '../constants/mission.js';
import BodyMap from './BodyMap.jsx';
import IndicatorCard from './IndicatorCard.jsx';
import OverallHealthCard from './OverallHealthCard.jsx';
import RegionDrawer from './RegionDrawer.jsx';

// Use exactly the personal dashboard's data builder, figure and region drawer for this crew ID.
export default function CrewBodyDashboard({ crewId, readings, profileId }) {
  const person = useMemo(() => buildRecordedDashboard({
    crewId,
    saved: readings.filter((r) => r.crew_id === crewId && r.kind === 'daily_vitals' && r.payload?.reading),
  }), [crewId, readings]);
  const regionStatuses = person.regions;
  const [openRegion, setOpenRegion] = useState(null);
  const labelRefs = useRef({});
  const returnTarget = useCallback(() => labelRefs.current[openRegion], [openRegion]);
  const profile = getProfile(profileId);
  return <>
    <div className="dashboard cmo-personal-dashboard">
      <BodyMap statuses={regionStatuses}
        wholeBody={person.regions.wholeBody} openRegion={openRegion}
        onOpen={setOpenRegion} labelRefs={labelRefs} source="Recorded readings for this crew member." />
      <div className="area-overall"><OverallHealthCard state={{ data: person.overall, loading: false, error: null, reload: () => {} }} label="Computed from latest readings" /></div>
      {person.cards.map((card) => <div key={card.id} className={`area-${card.area}`}><IndicatorCard indicator={card} profile={profile} /></div>)}
    </div>
    {openRegion && <RegionDrawer regionId={openRegion} status={regionStatuses[openRegion]} latestVitals={person.latest}
      crewRecord={person.crewRecord} personal={person.cardsById}
      pinned={(DRAWER_PINS[openRegion] ?? []).map((id) => person.cardsById[id]).filter(Boolean)}
      onClose={() => setOpenRegion(null)} getReturnTarget={returnTarget} profile={profile} />}
  </>;
}
