'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useHealthData } from './hooks/useHealthData.js';
import { useStoredSetting } from './hooks/useStoredSetting.js';
import { DEFAULT_PROFILE_ID, PROFILES_BY_ID } from './constants/mission.js';
import { getCrewMember } from './services/healthService.js';
import { OnboardProvider, useOnboard } from './hooks/useOnboard.jsx';
import { readVitalsCheckins } from './lib/vitalsCheckinStore.js';
import { canOpen, screenFor, tabsFor } from './lib/appScreens.js';
import { buildPersonDashboard } from './lib/personCards.js';
import { crewDaysOf, preflightDaysOf } from './data/bundled.js';
import Landing from './components/Landing.jsx';
import Header from './components/Header.jsx';
import Banner from './components/Banner.jsx';
import CheckinForm from './components/CheckinForm.jsx';
import Dashboard from './views/Dashboard.jsx';
import SleepRecovery from './views/SleepRecovery.jsx';
import About from './views/About.jsx';
import CrewMedicalOfficer from './views/CrewMedicalOfficer.jsx';
import dynamic from 'next/dynamic';

// Recharts is only needed on the Lab baseline view; load it on demand.
const LabBaseline = dynamic(() => import('./views/LabBaseline.jsx'), {
  ssr: false,
  loading: () => <section className="card card--lg" aria-busy="true"><span className="skel" style={{ width: '100%', height: 340 }} /></section>,
});

// The stand test also uses Recharts; load it on demand too.
const Environment = dynamic(() => import('./views/Environment.jsx'), {
  ssr: false,
  loading: () => <section className="card card--lg" aria-busy="true"><span className="skel" style={{ width: '100%', height: 340 }} /></section>,
});

const StandTest = dynamic(() => import('./views/StandTest.jsx'), {
  ssr: false,
  loading: () => <section className="card card--lg" aria-busy="true"><span className="skel" style={{ width: '100%', height: 340 }} /></section>,
});

export default function App() {
  return (
    <OnboardProvider>
      <Gate />
    </OnboardProvider>
  );
}

/** Signed out → landing screen. Signed in → the app, remounted per person so no state carries over. */
function Gate() {
  const onboard = useOnboard();
  const screen = screenFor(onboard);
  if (screen === 'loading') return <main className="landing" aria-busy="true" />;
  if (screen === 'landing') return <Landing />;
  return <AppShell key={onboard.crewId} />;
}

function AppShell() {
  const onboard = useOnboard();
  const crewId = onboard.crewId;
  const crew = useHealthData(() => getCrewMember(crewId), [crewId]);
  // Lena (CMO) gets her personal tabs plus the whole-crew tab; crew never get the CMO tab.
  const tabs = tabsFor(onboard.account);
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'checkin' | 'sleep' | 'labs' | 'environment' | 'standtest' | 'about'
  const [profileId, setProfileId] = useStoredSetting('ahm.missionProfile.v1', DEFAULT_PROFILE_ID, (v) => v in PROFILES_BY_ID);
  // Kept mounted once opened, so switching tabs mid-test does not lose the timers or readings.
  const [standVisited, setStandVisited] = useState(false);
  const [standFocus, setStandFocus] = useState(0);
  const [saved, setSaved] = useState([]); // this person's check-ins saved on this device, newest first
  const [banner, setBanner] = useState(null);

  const checkinButtonRef = useRef(null);
  const bannerRef = useRef(null);
  const pendingFocus = useRef(null); // 'banner' | 'checkinButton'

  // Move focus to a sensible place after returning to the dashboard.
  useEffect(() => {
    if (view !== 'dashboard' || !pendingFocus.current) return;
    const target = pendingFocus.current === 'banner' ? bannerRef.current : checkinButtonRef.current;
    pendingFocus.current = null;
    target?.focus();
  }, [view, banner]);

  useEffect(() => {
    if (view === 'standtest') setStandVisited(true);
  }, [view]);

  // This person's dashboard, from their own crew.json rows (latest day = synthetic crew record) and
  // their check-ins saved on this device. Re-read when records change or the outbox syncs.
  useEffect(() => {
    setSaved(readVitalsCheckins(crewId));
  }, [crewId, onboard.version]);
  const person = useMemo(
    () => buildPersonDashboard({ crewId, crewDays: crewDaysOf(crewId), preflight: preflightDaysOf(crewId), saved }),
    [crewId, saved],
  );
  const latestVitals = person.latest;
  const savedLatest = saved[0] ?? null;
  const latestCheckin = savedLatest?.payload?.context
    ? { ...savedLatest.payload.context, savedAt: savedLatest.recorded_at }
    : null;

  // Never show a view this person may not open (e.g. the CMO view for crew).
  useEffect(() => {
    if (!canOpen(onboard.account, view)) setView('dashboard');
  }, [view, onboard.account]);

  /** From the body map or the Today prompt: open the stand test and focus its title. */
  function openStandTest() {
    setView('standtest');
    setStandFocus((n) => n + 1);
    window.scrollTo(0, 0);
  }

  function openCheckin() {
    setView('checkin');
    window.scrollTo(0, 0);
  }

  function handleSaved(checkin) {
    if (checkin.vitals) setSaved((list) => [checkin.vitals, ...list.filter((r) => r.id !== checkin.vitals.id)]);
    setBanner(
      checkin.missionDay
        ? `Check-in saved for mission day ${checkin.missionDay}.`
        : 'Check-in saved.',
    );
    pendingFocus.current = 'banner';
    setView('dashboard');
  }

  function handleCancel() {
    pendingFocus.current = 'checkinButton';
    setView('dashboard');
  }

  function dismissBanner() {
    setBanner(null);
    checkinButtonRef.current?.focus();
  }

  return (
    <>
      <Header crew={crew} profileId={profileId} onProfileChange={setProfileId} updatedAt={latestVitals?.recorded_at} />

      <main className="container main">
        {view !== 'checkin' && (
          <nav className="viewtabs" aria-label="Views">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`viewtabs__tab${view === t.id ? ' is-active' : ''}`}
                aria-current={view === t.id ? 'page' : undefined}
                onClick={() => setView(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}

        {view === 'sleep' && <SleepRecovery />}
        {view === 'labs' && <LabBaseline />}
        {view === 'environment' && <Environment />}
        {view === 'about' && <About />}
        {view === 'cmo' && onboard.isCmo && <CrewMedicalOfficer />}

        {(standVisited || view === 'standtest') && (
          <div hidden={view !== 'standtest'}>
            <StandTest profileId={profileId} crewId={crewId} crewName={crew.data?.name} focusSignal={standFocus} />
          </div>
        )}

        {/* Kept mounted while the form is open so region selection and data survive. */}
        <div hidden={view !== 'dashboard'}>
          {banner && (
            <Banner focusRef={bannerRef} onDismiss={dismissBanner}>
              {banner}
            </Banner>
          )}
          <Dashboard
            latestCheckin={latestCheckin}
            onLogCheckin={openCheckin}
            checkinButtonRef={checkinButtonRef}
            profileId={profileId}
            onStartStandTest={openStandTest}
            person={person}
          />
        </div>

        {view === 'checkin' && (
          <CheckinForm
            missionDay={crew.data?.missionDay}
            crewId={crewId}
            crewName={crew.data?.name}
            profileId={profileId}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        )}
      </main>

      <footer className="container footer">
        {view === 'sleep' || view === 'labs' ? (
          <p>
            Sleep nights are general human data from PhysioNet (adults on Earth, not astronauts). Lab values are from
            NASA&apos;s Inspiration4 mission. Each panel names its source.
          </p>
        ) : view === 'environment' ? (
          <p>
            Radiation doses are environment data from NASA&apos;s Rodent Research-1 mission (ISS, 2014): the station&apos;s
            dose, not any crew member&apos;s personal dose.
          </p>
        ) : view === 'standtest' ? (
          <p>
            Seeded stand tests are synthetic data for a fictional crew. Tests you run are saved on this device. Alert
            lines follow the 2011 consensus definition of orthostatic hypotension; watch lines are team-set.
          </p>
        ) : view === 'cmo' ? (
          <p>
            Crew readings are synthetic data for a fictional crew, plus readings entered in this demo. Statuses come
            from the same checks the crew see; the Crew Medical Officer decides what happens next.
          </p>
        ) : view === 'about' ? (
          <p>Every limit and its source is listed in one place in the app, so this page always matches the checks.</p>
        ) : (
          <p>
            Every card is your own: your latest check-in on this device, or until then your latest synthetic crew
            record, scored against the limits listed under About and your own last 14 days; sparklines show your last
            14 days. Only Bones and muscles is sample: there is no per-person bone or muscle data yet.
          </p>
        )}
      </footer>
    </>
  );
}
