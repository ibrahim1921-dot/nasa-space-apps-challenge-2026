'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useHealthData } from './hooks/useHealthData.js';
import { MissionProvider, useMission } from './hooks/useMission.jsx';
import { getProfile } from './constants/mission.js';
import { getCrewMember } from './services/healthService.js';
import { OnboardProvider, useOnboard } from './hooks/useOnboard.jsx';
import { readVitalsCheckins } from './lib/vitalsCheckinStore.js';
import { canOpen, homeFor, screenFor, tabsFor } from './lib/appScreens.js';
import { accountKey } from './lib/session.js';
import Alerts from './views/Alerts.jsx';
import KnowledgeHub from './views/KnowledgeHub.jsx';
import Assessment from './views/Assessment.jsx';
import OfficerApp from './views/OfficerApp.jsx';
import { buildPersonDashboard } from './lib/personCards.js';
import { useDemo } from './hooks/useDemo.js';
import { eventsFor, onOrBefore } from './lib/demoState.js';
import { sensorDaysFor } from './lib/deviceScoring.js';
import DemoControls from './views/DemoControls.jsx';
import { crewDaysOf, preflightDaysOf } from './data/bundled.js';
import Landing from './components/Landing.jsx';
import CrewOverview from './components/CrewOverview.jsx';
import { OVERVIEW, canView, resolveViewedId } from './lib/permissions.js';
import { lastCheckinAt, openEmergencyPatients, topReason } from './lib/crewOverview.js';
import { orderWithMissed } from './lib/reminders.js';
import { useReminders } from './hooks/useReminders.js';
import ReminderBell from './components/ReminderBell.jsx';
import DueToday from './components/DueToday.jsx';
import MoreMenu from './components/MoreMenu.jsx';
import Vitals from './views/Vitals.jsx';
import Activities from './views/Activities.jsx';
import { useActivities } from './hooks/useActivities.js';
import { exerciseRow, reactionPanel } from './lib/activities.js';
import { regionIndicators } from './mocks/regions.js';
import { fitnessFor } from './lib/fitness.js';
import { fitnessFile } from './data/bundled.js';
import { crewMemberFor, crewRoster } from './mocks/crew.js';
import Header from './components/Header.jsx';
import Banner from './components/Banner.jsx';
import CheckinForm from './components/CheckinForm.jsx';
import ExamForm from './components/ExamForm.jsx';
import ExamNotice from './components/ExamNotice.jsx';
import { useAccessLog } from './hooks/useAccessLog.js';
import { EmergencyProvider, useEmergency } from './hooks/useEmergency.jsx';
import { emergenciesAbout } from './lib/emergency.js';
import { viewsOf } from './lib/accessLog.js';
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
// The environment view uses Recharts too.
const Environment = dynamic(() => import('./views/Environment.jsx'), {
  ssr: false,
  loading: () => <section className="card card--lg" aria-busy="true"><span className="skel" style={{ width: '100%', height: 340 }} /></section>,
});

const StandTest = dynamic(() => import('./views/StandTest.jsx'), {
  ssr: false,
  loading: () => <section className="card card--lg" aria-busy="true"><span className="skel" style={{ width: '100%', height: 340 }} /></section>,
});

/** One line per view under the disclaimer; the full detail lives on the About page. */
const FOOTER = {
  dashboard: 'Crew data is synthetic, for a fictional crew. Sensor readings are simulated.',
  vitals: 'Crew data is synthetic, for a fictional crew. Sensor readings are simulated.',
  checkin: 'Readings are saved and scored on this device first.',
  exam: 'Exams are saved and scored on this device first, against the crew member’s own history.',
  sleep: 'Sleep nights are general human data from PhysioNet: adults on Earth, not astronauts.',
  labs: 'Lab values are from NASA’s Inspiration4 crew.',
  environment: 'Station measurements from NASA’s RR-1 mission (ISS, 2014), not a crew member’s personal exposure.',
  standtest: 'Seeded stand tests are synthetic; tests you run are saved on this device.',
  cmo: 'Crew data is synthetic and sensor readings are simulated. The Crew Medical Officer decides what happens next.',
  demo: 'Demo controls change only this browser’s demo clock and simulated sensor events.',
  about: 'Every limit and its source is listed on this page, so it always matches the checks.',
  activities: 'Game sessions are saved on this device and never scored; they never change a reading or a status.',
  alerts: 'Alerts are live from the backend. Records the backend marks synthetic are labelled "Synthetic / not clinical".',
  knowledge: 'Text from the app’s cited sources; gaps are marked TODO. Images are placeholders.',
  assessment: 'Demo data: the model is not connected yet.',
};

const EXERCISE_BASE_ROW = regionIndicators.limbs.find((i) => i.id === 'exercise-time');

export default function App() {
  return (
    <OnboardProvider>
      <EmergencyProvider>
        <Gate />
      </EmergencyProvider>
    </OnboardProvider>
  );
}

/** Signed out → landing screen. Signed in → the app, remounted per person so no state carries over. */
function Gate() {
  const onboard = useOnboard();
  const screen = screenFor(onboard);
  if (screen === 'loading') return <main className="landing" aria-busy="true" />;
  if (screen === 'landing') return <Landing />;
  // Ground medical officer (backend NASA_OFFICER): no personal data, its own screens.
  if (onboard.isOfficer) return <OfficerApp key={accountKey(onboard.account)} />;
  // The mission environment is mission-wide: everyone sees it, only the CMO changes it from the header.
  return (
    <MissionProvider canChange={onboard.isCmo}>
      <AppShell key={accountKey(onboard.account)} />
    </MissionProvider>
  );
}

function AppShell() {
  const onboard = useOnboard();
  const crewId = onboard.crewId;
  const crew = useHealthData(() => getCrewMember(crewId), [crewId]);
  // Lena (CMO) gets her personal tabs plus the whole-crew tab; crew never get the CMO tab.
  const tabs = tabsFor(onboard.account);
  const [view, setView] = useState(() => homeFor(onboard.account)); // 'dashboard' | 'checkin' | 'sleep' | 'labs' | 'environment' | 'standtest' | 'about'
  const { profileId } = useMission(); // ahm.missionProfile.v1, see hooks/useMission.jsx
  // Kept mounted once opened, so switching tabs mid-test does not lose the timers or readings.
  const [standVisited, setStandVisited] = useState(false);
  const [standFocus, setStandFocus] = useState(0);
  const [saved, setSaved] = useState([]); // the shown person's check-ins saved on this device, newest first
  // The Crew Medical Officer can open any crew member's dashboard, read only, and opens on the crew page;
  // everyone else only ever sees their own. Every value goes through lib/permissions.js, so a stale or
  // forged one (state, a future saved value) falls back to the person's own id, or the crew page for the CMO.
  const viewerRole = onboard.account?.role ?? null;
  const [requestedView, setViewedId] = useState(OVERVIEW);
  const viewedId = resolveViewedId({ viewerId: crewId, viewerRole, requested: requestedView });
  const onOverview = viewedId === OVERVIEW;
  const shownId = onOverview ? crewId : viewedId;
  const viewingOther = shownId !== crewId;
  // CMO on her own data (the crew page or "My data"): Vitals says so, so it is not read as the crew's.
  const ownerLabel = onboard.isCmo && !viewingOther ? 'Your data' : null;
  const shown = crewMemberFor(shownId);
  const [banner, setBanner] = useState(null);
  const [examFor, setExamFor] = useState(null); // CMO only: the crew member being examined
  const access = useAccessLog();
  const emergency = useEmergency();
  // Demo clock: "today" is the last crew.json day + the demo offset; simulated sensor days fill the gap.
  const demo = useDemo();

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

  // The shown person's dashboard, from their own crew.json rows (latest day = synthetic crew record) and
  // their check-ins saved on this device. Re-read when records change or the outbox syncs.
  useEffect(() => {
    setSaved(readVitalsCheckins(shownId));
  }, [shownId, onboard.version]);
  const shownSensorDays = useMemo(() => sensorDaysFor(shownId, demo.state, demo.today), [shownId, demo.state, demo.today]);
  const ownSensorDays = useMemo(
    () => (shownId === crewId ? shownSensorDays : sensorDaysFor(crewId, demo.state, demo.today)),
    [shownId, crewId, shownSensorDays, demo.state, demo.today],
  );
  const sensorToday = ownSensorDays.find((d) => d.date === demo.today) ?? null;
  const person = useMemo(
    () =>
      buildPersonDashboard({
        crewId: shownId,
        crewDays: crewDaysOf(shownId),
        preflight: preflightDaysOf(shownId),
        saved,
        sensorDays: shownSensorDays,
        today: demo.today,
      }),
    [shownId, saved, shownSensorDays, demo.today],
  );

  // Every reading for the shown person: the six cards plus grip strength (Bones and muscles).
  const fitness = useMemo(() => fitnessFor(shownId, fitnessFile), [shownId]);
  const vitalCards = useMemo(() => [...person.cards, ...(fitness ? [fitness.grip] : [])], [person, fitness]);
  const [vitalId, setVitalId] = useState(null);

  /** Open one reading on the Vitals page (or the first one). */
  function openVital(id = null) {
    setVitalId(id);
    setView('vitals');
    window.scrollTo(0, 0);
  }

  // CMO only: every crew member's overall status, for the crew page and the Switch view menu.
  const crewStatus = useMemo(() => {
    if (!onboard.isCmo) return [];
    return crewRoster.map((c) => {
      const p = buildPersonDashboard({
        crewId: c.id,
        crewDays: crewDaysOf(c.id),
        preflight: preflightDaysOf(c.id),
        saved: readVitalsCheckins(c.id),
        sensorDays: sensorDaysFor(c.id, demo.state, demo.today),
        today: demo.today,
      });
      return { ...c, status: p.overall.status, reason: topReason(p.overall.reason), lastAt: lastCheckinAt(p) };
    });
  }, [onboard.isCmo, onboard.version, demo.state, demo.today]); // eslint-disable-line react-hooks/exhaustive-deps
  const emergencyIds = useMemo(() => openEmergencyPatients(emergency.all), [emergency.all]);

  // Reminders: one source (hooks/useReminders.js) for the bell, the "Due today" card, the CMO's
  // Crew overview markers and the ground list.
  const reminders = useReminders({ crewId, role: onboard.isCmo ? 'cmo' : 'crew', demo, profile: getProfile(profileId), crewStatus });
  const [bellOpen, setBellOpen] = useState(false);

  // Activities (More → Activities): this browser's game sessions and the signed-in person's patches.
  const activities = useActivities({ crewId, demo, profileId, emergencies: emergency.all });
  const [activityLaunch, setActivityLaunch] = useState(null); // { game, n }: a reminder opens a game directly
  function openActivity(game = null) {
    if (viewingOther) setViewedId(crewId); // games are always the signed-in person's own
    if (game) setActivityLaunch((l) => ({ game, n: (l?.n ?? 0) + 1 }));
    setView('activities');
    window.scrollTo(0, 0);
  }
  // Body-map drawer: exercise time from logged Crew Journey sessions (own: minutes; others: sessions only).
  const drawerExtras = useMemo(
    () => (EXERCISE_BASE_ROW ? { 'exercise-time': exerciseRow(EXERCISE_BASE_ROW, activities.records, shownId, demo.today, { own: !viewingOther }) } : null),
    [activities.records, shownId, demo.today, viewingOther],
  );
  const bellRef = useRef(null);

  const crewCards = useMemo(
    () =>
      orderWithMissed(
        crewStatus.map((c) => ({ ...c, emergency: emergencyIds.has(c.id), missed: reminders.markers.get(c.id) ?? null })),
        crewId,
        emergencyIds,
        reminders.markers,
      ),
    [crewStatus, emergencyIds, crewId, reminders.markers],
  );

  /** CMO: show one crew member's Today (or the crew page). Crew can only ever open their own. */
  function openCrew(id) {
    if (id !== OVERVIEW && !canView(crewId, viewerRole, id)) return;
    setViewedId(id);
    setView('dashboard');
    window.scrollTo(0, 0);
  }

  // CMO only: the header's Switch view menu. Crew get null, so their menu holds Sign out only.
  const viewMenu = onboard.isCmo
    ? {
        currentId: viewedId,
        onView: openCrew,
        items: [
          { id: OVERVIEW, label: 'Crew overview' },
          { id: crewId, label: 'My data' },
          ...crewStatus
            .filter((c) => c.id !== crewId)
            .map((c) => ({ id: c.id, label: c.name, status: c.status, note: emergencyIds.has(c.id) ? `${c.role} · Emergency open` : c.role })),
        ],
      }
    : null;

  // The CMO opening someone else's dashboard is logged (throttled in lib/accessLog.js).
  useEffect(() => {
    if (onboard.isCmo && viewingOther) access.logView(shownId);
  }, [onboard.isCmo, viewingOther, shownId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** CMO: record an exam for another crew member (never for herself). */
  function openExam(id) {
    if (!onboard.isCmo || !id || id === crewId) return;
    setExamFor(id);
    setView('exam');
    window.scrollTo(0, 0);
  }

  // The emergency guide opens the existing exam form for the patient (CMO only).
  const openExamRef = useRef(null);
  openExamRef.current = openExam;
  useEffect(() => (onboard.isCmo ? emergency.registerExam((id) => openExamRef.current(id)) : undefined), [onboard.isCmo]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleExamSaved(record) {
    const name = crewMemberFor(record.crew_id)?.name ?? record.crew_id;
    setViewedId(record.crew_id);
    if (record.crew_id === shownId) setSaved((list) => [record, ...list.filter((r) => r.id !== record.id)]);
    setBanner(`Exam saved for ${name}.`);
    setExamFor(null);
    pendingFocus.current = 'banner';
    setView('dashboard');
  }

  function handleExamCancel() {
    setExamFor(null);
    setView(viewingOther ? 'dashboard' : 'cmo');
  }

  const examPatient = examFor ? crewMemberFor(examFor) : null;
  const examSensorDays = useMemo(
    () => (examFor ? sensorDaysFor(examFor, demo.state, demo.today) : []),
    [examFor, demo.state, demo.today],
  );
  // Exams the CMO recorded for the signed-in crew member, for the notice on their own Today.
  const examsForMe = useMemo(
    () => (viewingOther ? [] : onOrBefore(saved, demo.today).filter((r) => r.payload?.kind_detail === 'cmo_exam')),
    [viewingOther, saved, demo.today],
  );
  const latestVitals = person.latest;
  // Check-ins dated after the demo's today stay hidden (not deleted) until the clock reaches them.
  const savedLatest = onOrBefore(saved, demo.today)[0] ?? null;
  const ownLatest = useMemo(
    () => (shownId === crewId ? savedLatest : onOrBefore(readVitalsCheckins(crewId), demo.today)[0] ?? null),
    [shownId, crewId, savedLatest, demo.today, onboard.version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const latestCheckin = savedLatest?.payload?.context
    ? { ...savedLatest.payload.context, savedAt: savedLatest.recorded_at }
    : null;

  // Never show a view this person may not open (e.g. the CMO view for crew).
  useEffect(() => {
    if (!canOpen(onboard.account, view)) setView(homeFor(onboard.account));
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

  /** A reminder's action button: open the screen that completes it (always the signed-in person's own). */
  function handleReminder(item) {
    const a = item.action;
    if (a.id === 'exam') return openExam(a.crewId);
    if (a.id === 'checkin') return openCheckin();
    if (a.id === 'standtest') return openStandTest();
    if (a.id === 'activity') return openActivity(a.game);
    if (a.id === 'grip') {
      if (onboard.isCmo && viewedId !== crewId) setViewedId(crewId); // the grip log is on her own Vitals
      return openVital('grip-strength');
    }
    return undefined;
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
      <Header
        crew={crew}
        profileId={profileId}
        updatedAt={latestVitals?.recorded_at}
        missionDay={demo.missionDay}
        viewMenu={viewMenu}
        reminderBell={<ReminderBell reminders={reminders} open={bellOpen} onOpenChange={setBellOpen} onAction={handleReminder} bellRef={bellRef} />}
      />

      <main className="container main">
        {view !== 'checkin' && view !== 'exam' && (
          <nav className="viewtabs" aria-label="Views">
            {tabs.map((t) =>
              t.items ? (
                <MoreMenu
                  key={t.id}
                  items={t.items}
                  view={view}
                  label={t.label}
                  menuId={`${t.id}-menu-list`}
                  onSelect={(id) => {
                    // The CMO's "My data" group always opens her own screens, not the crew page.
                    if (t.id === 'mydata') setViewedId(crewId);
                    setView(id);
                  }}
                />
              ) : (
                <button
                  key={t.id}
                  type="button"
                  className={`viewtabs__tab${view === t.id ? ' is-active' : ''}`}
                  aria-current={view === t.id ? 'page' : undefined}
                  onClick={() => setView(t.id)}
                >
                  {t.label}
                </button>
              ),
            )}
          </nav>
        )}

        {view === 'vitals' && (
          <>
            {viewingOther && (
              <div className="viewing viewing--slim" role="status">
                <p className="viewing__text">
                  Viewing <strong>{shown?.name}</strong>. Read only.
                </p>
                <button type="button" className="btn btn--secondary viewing__exam" onClick={() => openExam(shownId)}>
                  Record an exam
                </button>
              </div>
            )}
            <Vitals
              cards={vitalCards}
              selectedId={vitalId}
              onSelect={setVitalId}
              profile={getProfile(profileId)}
              personName={viewingOther ? shown?.name : undefined}
              ownerLabel={ownerLabel}
              gripLog={viewingOther ? null : { entries: reminders.gripEntries, onLog: reminders.logGrip }}
              reactionRun={viewingOther ? null : { panel: reactionPanel(activities.records, crewId, demo.today), onPlay: () => openActivity('reaction_run') }}
            />
          </>
        )}
        {view === 'activities' && (
          <Activities
            activities={activities}
            crewId={crewId}
            viewingOther={viewingOther}
            shownId={shownId}
            shownName={shown?.name}
            ownerLabel={ownerLabel}
            profileId={profileId}
            today={demo.today}
            launch={activityLaunch}
            onLaunchUsed={() => setActivityLaunch(null)}
          />
        )}
        {view === 'sleep' && <SleepRecovery />}
        {view === 'labs' && <LabBaseline />}
        {view === 'environment' && <Environment />}
        {view === 'about' && (
          <About viewsOfMe={viewsOf(access.entries, crewId)} emergenciesOfMe={emergenciesAbout(emergency.all, crewId)} notify={reminders.notify} />
        )}
        {view === 'alerts' && <Alerts />}
        {view === 'knowledge' && <KnowledgeHub />}
        {view === 'assessment' && <Assessment />}
        {view === 'demo' && <DemoControls demo={demo} groundList={reminders.ground} />}
        {view === 'cmo' && onboard.isCmo && <CrewMedicalOfficer selfId={crewId} onOpenCrew={openCrew} onRecordExam={openExam} accessEntries={access.entries} emergencies={emergency.all} />}

        {(standVisited || view === 'standtest') && (
          <div hidden={view !== 'standtest'}>
            <StandTest profileId={profileId} crewId={crewId} crewName={crew.data?.name} focusSignal={standFocus} today={demo.today} />
          </div>
        )}

        {/* Kept mounted while the form is open so region selection and data survive. */}
        <div hidden={view !== 'dashboard'}>
          {/* The signed-in person's own reminders (never shown while viewing someone else). */}
          {!viewingOther && <DueToday reminders={reminders} onAction={handleReminder} onSeeAll={() => setBellOpen(true)} />}
          {onboard.isCmo && onOverview && <CrewOverview cards={crewCards} selfId={crewId} onOpen={openCrew} />}
          {onboard.isCmo && viewedId === crewId && (
            <p className="crew-overview__back">
              <button type="button" className="link-btn crew-overview__back-btn" onClick={() => openCrew(OVERVIEW)}>
                <span aria-hidden="true">←</span> Crew overview
              </button>
            </p>
          )}
          {viewingOther && (
            <div className="viewing" role="status">
              <p className="viewing__text">
                Viewing <strong>{shown?.name}</strong>
                <span className="muted"> · {shown?.role}</span>. Read only: check-ins and stand tests are logged by
                the crew member.
              </p>
              <div className="viewing__actions">
                <button type="button" className="btn btn--primary viewing__exam" onClick={() => openExam(shownId)}>
                  Record an exam
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => openCrew(OVERVIEW)}>
                  Back to crew overview
                </button>
              </div>
            </div>
          )}
          {!viewingOther && !onOverview && examsForMe.length > 0 && <ExamNotice crewId={crewId} exams={examsForMe} />}
          {banner && (
            <Banner focusRef={bannerRef} onDismiss={dismissBanner}>
              {banner}
            </Banner>
          )}
          {/* Hidden, not unmounted, on the crew page so an open region or drawer survives. */}
          <div hidden={onOverview}>
          <Dashboard
            latestCheckin={latestCheckin}
            onLogCheckin={viewingOther ? null : openCheckin}
            checkinButtonRef={checkinButtonRef}
            profileId={profileId}
            onStartStandTest={viewingOther ? null : openStandTest}
            person={person}
            crewId={shownId}
            readings={vitalCards}
            onOpenVital={openVital}
            today={demo.today}
            sensorsToday={!viewingOther && Boolean(sensorToday)}
            drawerExtras={drawerExtras}
          />
          </div>
        </div>

        {view === 'exam' && onboard.isCmo && examPatient && examFor !== crewId && (
          <ExamForm
            key={examFor}
            patientId={examFor}
            patientName={examPatient.name}
            examiner={{ crew_id: crewId, name: onboard.account.name, role: onboard.account.role }}
            today={demo.today}
            missionDay={demo.missionDay}
            sensorDays={examSensorDays}
            demoEvents={eventsFor(demo.state, examFor)}
            profileId={profileId}
            onSaved={handleExamSaved}
            onCancel={handleExamCancel}
          />
        )}

        {view === 'checkin' && (
          <CheckinForm
            missionDay={demo.missionDay}
            today={demo.today}
            sensorDay={sensorToday}
            sensorDays={ownSensorDays}
            lastContext={ownLatest?.payload?.context ?? null}
            enteredBy={onboard.account ? { crew_id: crewId, name: onboard.account.name, role: onboard.account.role } : null}
            demoEvents={eventsFor(demo.state, crewId)}
            crewId={crewId}
            crewName={crew.data?.name}
            profileId={profileId}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        )}
      </main>

      <footer className="container footer">
        <p className="footer__disclaimer">
          Prototype for decision support. Not a medical device and not a diagnosis.
        </p>
        <p>{FOOTER[view] ?? FOOTER.dashboard} Sources and limits are listed under More → About.</p>
      </footer>
    </>
  );
}
