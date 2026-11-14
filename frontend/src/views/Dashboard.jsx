'use client';

import { useCallback, useRef, useState } from 'react';
import { useHealthData } from '../hooks/useHealthData.js';
import { getRegionStatuses } from '../services/healthService.js';
import IndicatorCard from '../components/IndicatorCard.jsx';
import BodyMap from '../components/BodyMap.jsx';
import RegionDrawer from '../components/RegionDrawer.jsx';
import OverallHealthCard from '../components/OverallHealthCard.jsx';
import ContextCard from '../components/ContextCard.jsx';
import SourceLabel from '../components/SourceLabel.jsx';
import { getProfile } from '../constants/mission.js';
import { DRAWER_PINS } from '../lib/personCards.js';

/** Regions with no per-person data: their status is the shared demo value, labelled "Sample". */
const SAMPLE_REGIONS = ['limbs'];

function GravityPrompt({ profile, onStart }) {
  return (
    <section className="gravity-prompt" aria-labelledby="gravity-title">
      <div className="gravity-prompt__body">
        <h2 id="gravity-title" className="gravity-prompt__title">
          Arrival in gravity: complete a stand test before EVA or heavy work.
        </h2>
        <SourceLabel source={`Mission profile: ${profile.label}`} />
      </div>
      <button type="button" className="btn btn--primary" onClick={onStart}>
        Start stand test
      </button>
    </section>
  );
}

/**
 * The signed-in person's dashboard. `person` comes from lib/personCards.js (buildPersonDashboard):
 * six cards, region statuses and the overall score, all from that person's own crew.json rows and
 * check-ins. Only Bones and muscles is sample.
 */
export default function Dashboard({ latestCheckin, onLogCheckin, checkinButtonRef, profileId, onStartStandTest, person }) {
  const profile = getProfile(profileId);
  // Bones and muscles: the shared demo status (no per-person data), from the API or its device copy.
  const sample = useHealthData(getRegionStatuses);
  const regionStatuses = { ...person.regions, limbs: sample.data?.limbs ?? null };

  const [openRegion, setOpenRegion] = useState(null);
  const labelRefs = useRef({});
  // Focus always returns to the region's label, even when the figure itself was clicked.
  const returnTarget = useCallback(() => labelRefs.current[openRegion], [openRegion]);

  const latest = person.latest;
  const basis = latest?.fromCrewRecord ? 'synthetic crew record' : 'your check-in';
  const overallState = { data: person.overall, loading: false, error: null, reload: () => {} };

  return (
    <>
      {profile.gravityArrival && <GravityPrompt profile={profile} onStart={onStartStandTest} />}
      <div className="dashboard">
        <BodyMap
          statuses={regionStatuses}
          statusError={sample.error}
          sampleRegions={SAMPLE_REGIONS}
          wholeBody={person.regions.wholeBody}
          openRegion={openRegion}
          onOpen={setOpenRegion}
          labelRefs={labelRefs}
          source={`Region status: from your latest readings (${basis}) · Bones and muscles: sample`}
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
          onStartStandTest={
            openRegion === 'chest'
              ? () => {
                  setOpenRegion(null);
                  onStartStandTest();
                }
              : undefined
          }
        />
      )}
    </>
  );
}
