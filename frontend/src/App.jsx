
'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import dynamic from 'next/dynamic';

import { useHealthData } from './hooks/useHealthData.js';
import { useStoredSetting } from './hooks/useStoredSetting.js';

import {
  DEFAULT_PROFILE_ID,
  PROFILES_BY_ID,
} from './constants/mission.js';

import { getCrewMember } from './services/healthService.js';

import {
  OnboardProvider,
  useOnboard,
} from './hooks/useOnboard.jsx';

import { readVitalsCheckins } from './lib/vitalsCheckinStore.js';

import {
  canOpen,
  screenFor,
  tabsFor,
  MY_DATA_SCREENS,
} from './lib/appScreens.js';

import { buildPersonDashboard } from './lib/personCards.js';

import {
  crewDaysOf,
  preflightDaysOf,
} from './data/bundled.js';

import Landing from './components/Landing.jsx';
import Header from './components/Header.jsx';
import Banner from './components/Banner.jsx';
import CheckinForm from './components/CheckinForm.jsx';

import Dashboard from './views/Dashboard.jsx';
import SleepRecovery from './views/SleepRecovery.jsx';
import About from './views/About.jsx';
import CrewMedicalOfficer from './views/CrewMedicalOfficer.jsx';

// ---------------------------------------------
// LOAD CHART-HEAVY SCREENS ON DEMAND
// ---------------------------------------------

const LabBaseline = dynamic(
  () => import('./views/LabBaseline.jsx'),
  {
    ssr: false,
    loading: () => (
      <section
        className="card card--lg"
        aria-busy="true"
      >
        <span
          className="skel"
          style={{ width: '100%', height: 340 }}
        />
      </section>
    ),
  }
);

const Environment = dynamic(
  () => import('./views/Environment.jsx'),
  {
    ssr: false,
    loading: () => (
      <section
        className="card card--lg"
        aria-busy="true"
      >
        <span
          className="skel"
          style={{ width: '100%', height: 340 }}
        />
      </section>
    ),
  }
);

const StandTest = dynamic(
  () => import('./views/StandTest.jsx'),
  {
    ssr: false,
    loading: () => (
      <section
        className="card card--lg"
        aria-busy="true"
      >
        <span
          className="skel"
          style={{ width: '100%', height: 340 }}
        />
      </section>
    ),
  }
);

// ---------------------------------------------
// MAIN APPLICATION PROVIDER
// ---------------------------------------------

export default function App() {
  return (
    <OnboardProvider>
      <Gate />
    </OnboardProvider>
  );
}

/**
 * Determines which application screen appears.
 *
 * Signed out -> Landing
 * Signed in -> App
 *
 * Remounts the application for each crew member
 * so personal state does not carry over.
 */
function Gate() {
  const onboard = useOnboard();
  const screen = screenFor(onboard);

  if (screen === 'loading') {
    return (
      <main
        className="landing"
        aria-busy="true"
      />
    );
  }

  if (screen === 'landing') {
    return <Landing />;
  }

  return <AppShell key={onboard.crewId} />;
}

// ---------------------------------------------
// MAIN APPLICATION SHELL
// ---------------------------------------------

function AppShell() {
  const onboard = useOnboard();

  const crewId = onboard.crewId;
  const isMedicalOfficer = onboard.isCmo;

  const crew = useHealthData(
    () => getCrewMember(crewId),
    [crewId]
  );

  // Get the main navigation for the current user.
  const tabs = tabsFor(onboard.account);

  // Current visible screen.
  const [view, setView] = useState('dashboard');

  /**
   * NEW:
   * Controls whether the My Data menu is expanded.
   * Only medical officers see this expandable menu.
   */
  const [myDataOpen, setMyDataOpen] = useState(false);

  // Determines where personal health data appears.
  const personalDashboardView = isMedicalOfficer
    ? 'mydata'
    : 'dashboard';

  /**
   * All screens belonging to the medical officer's
   * My Data section.
   */
  const isMyDataScreen =
    isMedicalOfficer &&
    MY_DATA_SCREENS.some(
      (screen) => screen.id === view
    );

  const [profileId, setProfileId] = useStoredSetting(
    'ahm.missionProfile.v1',
    DEFAULT_PROFILE_ID,
    (value) => value in PROFILES_BY_ID
  );

  // Keep stand tests mounted after the first visit.
  const [standVisited, setStandVisited] = useState(false);
  const [standFocus, setStandFocus] = useState(0);

  // Personal check-ins saved on this device.
  const [saved, setSaved] = useState([]);

  // Check-in confirmation message.
  const [banner, setBanner] = useState(null);

  const checkinButtonRef = useRef(null);
  const bannerRef = useRef(null);
  const pendingFocus = useRef(null);

  // ---------------------------------------------
  // RESTORE FOCUS AFTER PERSONAL CHECK-IN
  // ---------------------------------------------

  useEffect(() => {
    if (
      view !== personalDashboardView ||
      !pendingFocus.current
    ) {
      return;
    }

    const target =
      pendingFocus.current === 'banner'
        ? bannerRef.current
        : checkinButtonRef.current;

    pendingFocus.current = null;
    target?.focus();
  }, [view, banner, personalDashboardView]);

  // ---------------------------------------------
  // STAND TEST STATE
  // ---------------------------------------------

  useEffect(() => {
    if (view === 'standtest') {
      setStandVisited(true);
    }
  }, [view]);

  // ---------------------------------------------
  // LOAD PERSONAL CHECK-INS
  // ---------------------------------------------

  useEffect(() => {
    setSaved(readVitalsCheckins(crewId));
  }, [crewId, onboard.version]);

  // Build health information for the signed-in user.
  const person = useMemo(
    () =>
      buildPersonDashboard({
        crewId,
        crewDays: crewDaysOf(crewId),
        preflight: preflightDaysOf(crewId),
        saved,
      }),
    [crewId, saved]
  );

  const latestVitals = person.latest;

  const savedLatest = saved[0] ?? null;

  const latestCheckin = savedLatest?.payload?.context
    ? {
        ...savedLatest.payload.context,
        savedAt: savedLatest.recorded_at,
      }
    : null;

  // ---------------------------------------------
  // ACCESS CONTROL
  // ---------------------------------------------

  useEffect(() => {
    if (!canOpen(onboard.account, view)) {
      setView('dashboard');
    }
  }, [view, onboard.account]);

  // ---------------------------------------------
  // NAVIGATION FUNCTIONS
  // ---------------------------------------------

  /**
   * NEW:
   * Toggle My Data when the medical officer
   * clicks its main navigation button.
   */

function toggleMyData() {
  setMyDataOpen((previousState) => !previousState);
}


  /**
   * NEW:
   * Open a screen inside My Data.
   */
  
function openMyDataScreen(screenId) {
  if (!canOpen(onboard.account, screenId)) {
    return;
  }

  // Open the selected personal health screen.
  setView(screenId);

  // Automatically close the dropdown.
  setMyDataOpen(false);

  // Scroll to the top of the screen.
  window.scrollTo(0, 0);
}


  /**
   * Open a main navigation tab.
   */
  function openMainTab(tabId) {
    if (tabId === 'mydata' && isMedicalOfficer) {
      toggleMyData();
      return;
    }

    setView(tabId);
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------
  // STAND TEST
  // ---------------------------------------------

  function openStandTest() {
    // Ensure My Data is expanded for medical officers.
    if (isMedicalOfficer) {
      setMyDataOpen(true);
    }

    setView('standtest');

    setStandFocus((number) => number + 1);

    window.scrollTo(0, 0);
  }

  // ---------------------------------------------
  // CHECK-IN
  // ---------------------------------------------

  function openCheckin() {
    setView('checkin');
    window.scrollTo(0, 0);
  }

  /**
   * Save a personal check-in.
   *
   * Medical officers return to My Data.
   * Crew members return to Dashboard.
   */
  function handleSaved(checkin) {
    if (checkin.vitals) {
      setSaved((list) => [
        checkin.vitals,
        ...list.filter(
          (record) =>
            record.id !== checkin.vitals.id
        ),
      ]);
    }

    setBanner(
      checkin.missionDay
        ? `Check-in saved for mission day ${checkin.missionDay}.`
        : 'Check-in saved.'
    );

    pendingFocus.current = 'banner';

    if (isMedicalOfficer) {
      setMyDataOpen(true);
    }

    setView(personalDashboardView);
  }

  /**
   * Cancel a check-in.
   */
  function handleCancel() {
    pendingFocus.current = 'checkinButton';

    if (isMedicalOfficer) {
      setMyDataOpen(true);
    }

    setView(personalDashboardView);
  }

  function dismissBanner() {
    setBanner(null);
    checkinButtonRef.current?.focus();
  }

  // ---------------------------------------------
  // APPLICATION INTERFACE
  // ---------------------------------------------

  return (
    <>
      {/* MAIN HEADER */}

      <Header
        crew={crew}
        profileId={profileId}
        onProfileChange={setProfileId}
        updatedAt={latestVitals?.recorded_at}
      />

      <main className="container main">

        {/* MAIN NAVIGATION */}

        {view !== 'checkin' && (
          <nav
            className="viewtabs"
            aria-label="Views"
          >
            {tabs.map((tab) => {
              /**
               * My Data is highlighted whenever
               * one of its personal screens is open.
               */
              const isActive =
                tab.id === 'mydata'
                  ? isMyDataScreen
                  : view === tab.id;

              return (
                <div
                  key={tab.id}
                  className={
                    tab.id === 'mydata' && isMedicalOfficer
                      ? 'mydata-nav-group'
                      : 'mydata-nav-item'
                  }
                >
                  {/* MAIN NAVIGATION BUTTON */}

                  <button
                    type="button"
                    className={`viewtabs__tab${
                      isActive ? ' is-active' : ''
                    }`}
                    aria-current={
                      isActive ? 'page' : undefined
                    }
                    aria-expanded={
                      tab.id === 'mydata' &&
                      isMedicalOfficer
                        ? myDataOpen
                        : undefined
                    }
                    aria-controls={
                      tab.id === 'mydata' &&
                      isMedicalOfficer
                        ? 'mydata-submenu'
                        : undefined
                    }
                    onClick={() =>
                      openMainTab(tab.id)
                    }
                  >
                    {tab.label}

                    {/* Expand/collapse indicator */}
                    {tab.id === 'mydata' &&
                      isMedicalOfficer && (
                        <span
                          aria-hidden="true"
                          className="mydata-chevron"
                        >
                          {myDataOpen ? ' ▴' : ' ▾'}
                        </span>
                      )}
                  </button>

                  {/* NEW: EXPANDABLE MY DATA SUBMENU */}

                  {tab.id === 'mydata' &&
                    isMedicalOfficer &&
                    myDataOpen && (
                      <div
                        id="mydata-submenu"
                        className="mydata-submenu"
                        aria-label="Personal health screens"
                      >
                        {MY_DATA_SCREENS.map(
                          (screen) => (
                            <button
                              key={screen.id}
                              type="button"
                              className={`mydata-submenu__tab${
                                view === screen.id
                                  ? ' is-active'
                                  : ''
                              }`}
                              aria-current={
                                view === screen.id
                                  ? 'page'
                                  : undefined
                              }
                              onClick={() =>
                                openMyDataScreen(
                                  screen.id
                                )
                              }
                            >
                              {screen.label}
                            </button>
                          )
                        )}
                      </div>
                    )}
                </div>
              );
            })}
          </nav>
        )}

        {/* ------------------------------------
            SHARED SCREENS
           ------------------------------------ */}

        {view === 'sleep' && (
          <SleepRecovery />
        )}

        {view === 'labs' && (
          <LabBaseline />
        )}

        {view === 'environment' && (
          <Environment />
        )}

        {view === 'about' && (
          <About />
        )}

        {/* ------------------------------------
            MEDICAL OFFICER DASHBOARD
            Crew-wide monitoring.
           ------------------------------------ */}

        {view === 'dashboard' &&
          isMedicalOfficer && (
            <CrewMedicalOfficer />
          )}

        {/* ------------------------------------
            STAND TEST
            Preserves active test state.
           ------------------------------------ */}

        {(standVisited || view === 'standtest') && (
          <div hidden={view !== 'standtest'}>
            <StandTest
              profileId={profileId}
              crewId={crewId}
              crewName={crew.data?.name}
              focusSignal={standFocus}
            />
          </div>
        )}

        {/* ------------------------------------
            PERSONAL HEALTH DASHBOARD

            Medical officer:
            My Data -> Health Overview

            Regular crew:
            Dashboard
           ------------------------------------ */}

        <div
          hidden={
            view !== personalDashboardView
          }
        >
          {banner && (
            <Banner
              focusRef={bannerRef}
              onDismiss={dismissBanner}
            >
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

        {/* ------------------------------------
            PERSONAL CHECK-IN FORM
           ------------------------------------ */}

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


    </>
  );
}
