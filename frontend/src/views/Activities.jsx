'use client';

import { useEffect, useRef, useState } from 'react';
import { GAME_KINDS, GAMES, LOGGED_NOT_SCORED } from '../content/activities.js';
import { GATE_TEXT, gate, journeyProgress, myMinutes, reactionBaseline, sessionsOn, weekSessions } from '../lib/activities.js';
import DockPilot from '../components/activities/DockPilot.jsx';
import ReactionRun from '../components/activities/ReactionRun.jsx';
import CalmOrbit from '../components/activities/CalmOrbit.jsx';
import CrewJourney from '../components/activities/CrewJourney.jsx';
import RouteLine from '../components/activities/RouteLine.jsx';
import PatchShelf from '../components/activities/PatchShelf.jsx';
import { WhySource } from '../components/WhyItMatters.jsx';

const stamp = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Re-render every 30 s: quiet hours follow the real clock. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * More → Activities: four short games, the shared Crew Journey and "Your patches".
 * Viewing someone else (CMO): their sessions this week, counts and dates only, never results or patches.
 * @param {{ activities: { records, patches, save }, crewId: string, viewingOther: boolean, shownId: string, shownName?: string,
 *   ownerLabel?: string|null, profileId: string, today: string, launch?: { game: string, n: number } | null, onLaunchUsed?: () => void }} props
 */
export default function Activities({ activities, crewId, viewingOther, shownId, shownName, ownerLabel = null, profileId, today, launch = null, onLaunchUsed }) {
  const [screen, setScreen] = useState('home');
  const now = useNow();
  const cardRefs = useRef({});
  const lastGame = useRef(null);
  const { records, patches, save } = activities;

  // A reminder's "Play Reaction Run" opens the game directly.
  useEffect(() => {
    if (!launch?.game || viewingOther) return;
    lastGame.current = launch.game;
    setScreen(launch.game);
    onLaunchUsed?.(); // once only: opening Activities later starts on the list
  }, [launch, viewingOther]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (viewingOther) setScreen('home');
  }, [viewingOther]);

  function open(kind) {
    lastGame.current = kind;
    setScreen(kind);
    window.scrollTo(0, 0);
  }
  function exit() {
    setScreen('home');
    // Back on the list: focus the card's button that was used.
    requestAnimationFrame(() => cardRefs.current[lastGame.current]?.focus());
  }

  if (viewingOther) {
    const week = weekSessions(records, shownId, today, GAME_KINDS);
    return (
      <section className="card card--lg act-page" aria-labelledby="act-title">
        <h2 id="act-title" className="view-title">
          Activities
        </h2>
        <p className="muted">
          {shownName}’s sessions in the last 7 days. Session counts only; results are seen only by the crew member. {LOGGED_NOT_SCORED}.
        </p>
        <ul className="act-week">
          {GAMES.map((g) => {
            const w = week[g.kind];
            return (
              <li key={g.kind} className="act-week__row">
                <span className="act-week__name">{g.name}</span>
                <span className="num">
                  {w.count} {w.count === 1 ? 'session' : 'sessions'}
                </span>
                <span className="muted">{w.dates.length ? w.dates.map(stamp).join(', ') : 'None this week'}</span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const gateOf = (kind) => gate({ kind, records, crewId, demoDate: today, now });
  const progress = journeyProgress(records, profileId, today);
  const saveAs = (kind) => (data) => save(kind, data);

  if (screen === 'dock_pilot')
    return <DockPilot onSave={saveAs('dock_pilot')} onExit={exit} records={records} crewId={crewId} today={today} gate={gateOf('dock_pilot')} />;
  if (screen === 'reaction_run')
    return <ReactionRun onSave={saveAs('reaction_run')} onExit={exit} usual={reactionBaseline(records, crewId, today)} gate={gateOf('reaction_run')} />;
  if (screen === 'calm_orbit') return <CalmOrbit onSave={saveAs('calm_orbit')} onExit={exit} />;
  if (screen === 'crew_journey')
    return <CrewJourney onSave={saveAs('crew_journey')} onExit={exit} progress={progress} mine={myMinutes(records, crewId, today)} gate={gateOf('crew_journey')} />;

  return (
    <div className="act-page">
      <section className="card card--lg" aria-labelledby="act-title">
        <h2 id="act-title" className="view-title">
          Activities
          {ownerLabel && <span className="owner-label">{ownerLabel}</span>}
        </h2>
        <p className="muted">Short games that are good for you. Every session is {LOGGED_NOT_SCORED.toLowerCase()}: nothing here changes a reading.</p>
        <ul className="act-games">
          {GAMES.map((g) => {
            const st = gateOf(g.kind);
            const doneToday = sessionsOn(records, crewId, g.kind, today) > 0;
            return (
              <li key={g.kind} className="act-game">
                <div className="act-game__top">
                  <h3 className="act-game__name">{g.name}</h3>
                  <span className={`act-chip${doneToday ? ' is-done' : ''}`}>{doneToday ? 'Done today' : 'Due today'}</span>
                </div>
                <p className="act-game__helps">{g.helps}</p>
                {g.why && (
                  <div className="dock-why dock-why--card">
                    <p className="dock-why__text">
                      <strong>Why it helps:</strong> {g.why}
                    </p>
                    <WhySource source={g.whySource} />
                  </div>
                )}
                <p className="muted act-game__time">{g.time}</p>
                {st !== 'open' && <p className="act-gate">{GATE_TEXT[st]}</p>}
                <button
                  ref={(el) => {
                    cardRefs.current[g.kind] = el;
                  }}
                  type="button"
                  className="btn act-btn act-game__go"
                  onClick={() => open(g.kind)}
                  disabled={st !== 'open'}
                >
                  {g.kind === 'crew_journey' ? 'Log exercise' : `Play ${g.name}`}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <RouteLine progress={progress} mine={myMinutes(records, crewId, today)} />
      <PatchShelf patches={patches} />
    </div>
  );
}
