'use client';

import { useCallback, useRef, useState } from 'react';
import ReadingTiles from '../components/ReadingTiles.jsx';
import NeedsAttention from '../components/NeedsAttention.jsx';
import BodyMap from '../components/BodyMap.jsx';
import RegionDrawer from '../components/RegionDrawer.jsx';
import OverallHealthCard from '../components/OverallHealthCard.jsx';
import ContextCard from '../components/ContextCard.jsx';
import WellnessCard from '../components/WellnessCard.jsx';
import RecordObservationContexts from '../components/RecordObservationContexts.jsx';
import PersistedObservationHistory from '../components/PersistedObservationHistory.jsx';
import SourceLabel from '../components/SourceLabel.jsx';
import { getProfile } from '../constants/mission.js';
import { contextLine, environmentRules } from '../lib/environmentRules.js';
import EnvironmentIcon from '../components/EnvironmentIcon.jsx';
import { DRAWER_PINS } from '../lib/personCards.js';
import { fitnessFor } from '../lib/fitness.js';
import { fitnessFile } from '../data/bundled.js';


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
 * check-ins. Bones and muscles comes from their grip strength against their own preflight value.
 */
export default function Dashboard({
  crewId,
  latestCheckin,
  onLogCheckin,
  checkinButtonRef,
  profileId,
  onStartStandTest,
  person,
  readings = person.cards,
  onOpenVital = () => {},
  today = null,
  sensorsToday = false,
  drawerExtras = null, // { [indicatorId]: row } game rows for the body-map drawer (Activities: exercise time, not scored)
  latestWellness = null, // newest wellness check-in on this device (lib/wellnessCheckin.js)
  onLogWellness = null,
}) {
  const profile = getProfile(profileId);
  const rules = environmentRules(profile);
  // Bones and muscles: this person's grip strength against their own preflight value (lib/fitness.js).
  const fitness = fitnessFor(crewId, fitnessFile);
  const regionStatuses = { ...person.regions, limbs: fitness?.grip.status ?? null };

  const [openRegion, setOpenRegion] = useState(null);
  const labelRefs = useRef({});
  // Focus always returns to the region's label, even when the figure itself was clicked.
  const returnTarget = useCallback(() => labelRefs.current[openRegion], [openRegion]);

  const latest = person.latest;
  const basis = latest?.fromCrewRecord ? 'synthetic crew record' : latest?.fromSensor ? 'simulated sensors' : 'your check-in';
  const overallState = { data: person.overall, loading: false, error: null, reload: () => {} };

  return (
    <>
      <p className="today__context">
        <EnvironmentIcon setting={profile.setting} size={16} />
        {contextLine(profile)}
      </p>
      {/* Only where the stand test can be done (a surface base); in weightlessness standing has no effect. */}
      {rules.standTest.available && onStartStandTest && <GravityPrompt profile={profile} onStart={onStartStandTest} />}
      <div className="today">
        <BodyMap
          statuses={regionStatuses}
          wholeBody={person.regions.wholeBody}
          openRegion={openRegion}
          onOpen={setOpenRegion}
          labelRefs={labelRefs}
          source={`Region status: from your latest readings (${basis}) · Bones and muscles: your grip strength vs preflight`}
          simulated={Boolean(latest?.fromSensor)}
        />

        <div className="today__side">
          <OverallHealthCard state={overallState} label="Computed from your latest readings" />
          <NeedsAttention cards={readings} onOpen={onOpenVital} onOpenAll={() => onOpenVital()} />
          <section className="card" aria-labelledby="readings-title">
            <div className="card__head">
              <h2 id="readings-title" className="card__title">
                Today&apos;s readings
              </h2>
              <button type="button" className="link-btn" onClick={() => onOpenVital()}>
                All details
              </button>
            </div>
            <ReadingTiles cards={readings} onOpen={onOpenVital} label="Today's readings" />
          </section>
          <ContextCard
            latestCheckin={latestCheckin}
            onLogCheckin={onLogCheckin}
            buttonRef={checkinButtonRef}
            today={today}
            sensorsToday={sensorsToday}
          />
          <WellnessCard latest={latestWellness} onLog={onLogWellness} />
        </div>
      </div>

      {/* Teammate feature (f291403): saved check-ins with their measurement context, and the backend's history. */}
      {!!person.observationHistory?.length && (
        <details className="card observation-history">
          <summary>Saved check-in history</summary>
          <p className="muted">Saved on this device.</p>
          {person.observationHistory.slice(0, 10).map((record) => (
            <article key={record.id}>
              <time dateTime={record.recorded_at}>{new Date(record.recorded_at).toLocaleString()}</time>
              <RecordObservationContexts record={record} />
            </article>
          ))}
        </details>
      )}
      <PersistedObservationHistory crewCode={crewId} />

      {openRegion && (
        <RegionDrawer
          regionId={openRegion}
          status={regionStatuses[openRegion]}
          latestVitals={latest}
          crewRecord={person.crewRecord}
          personal={drawerExtras ? { ...person.cardsById, ...drawerExtras } : person.cardsById}
          pinned={
            openRegion === 'limbs'
              ? (fitness?.rows ?? [])
              : (DRAWER_PINS[openRegion] ?? []).map((id) => person.cardsById[id]).filter(Boolean)
          }
          onClose={() => setOpenRegion(null)}
          vitalIds={readings.map((r) => r.id)}
          onOpenVital={onOpenVital}
          getReturnTarget={returnTarget}
          profile={profile}
          onStartStandTest={
            openRegion === 'chest' && onStartStandTest
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
