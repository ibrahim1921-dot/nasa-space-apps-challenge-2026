'use client';

// The emergency guide: a full-screen overlay with a solid dark background (no glass blur), opened from
// the Emergency button or the red band. Escape does nothing here: only "End emergency" closes the guide
// (the start screen can be cancelled while nothing has been recorded yet, and the live view of someone
// else's emergency can go back to the app).

import { useEffect, useRef, useState } from 'react';
import { useEmergency } from '../hooks/useEmergency.jsx';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { crewRoster } from '../mocks/crew.js';
import { getProfile } from '../constants/mission.js';
import { crewNameFor } from '../lib/provenance.js';
import { canAct, cmoIsPatient, environmentFor, hasCompressions } from '../lib/emergency.js';
import { CHEST_PAIN_STEPS, CMO_IS_PATIENT, COLLAPSE_STEPS, COLLAPSE_TOTAL, ENVIRONMENTS, EVENT_LABELS, FLOWS, POSITIONS } from '../content/emergency.js';
import StepSource from './StepSource.jsx';
import CprFigure from './CprFigure.jsx';
import CprScreen, { DelayLine } from './CprScreen.jsx';
import { EmergencyIcon } from './EmergencyButton.jsx';

const firstName = (id) => (crewNameFor(id) ?? id ?? '').split(' ')[0];
const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
/** "about 20 min" from "about 20 min one-way (approximate …)". */
const shortDelay = (text) => text.replace(/ one-way.*$/, '').replace(/ \(.*\)$/, '');

function DrillBand({ drill }) {
  if (!drill) return null;
  return (
    <p className="emg-drill" role="note">
      DRILL <span className="emg-drill__sub">practice only, not a real emergency</span>
    </p>
  );
}

function CmoPatientNote({ em }) {
  if (!em || !cmoIsPatient(em)) return null;
  return (
    <p className="emg-cmo-patient" role="alert">
      {CMO_IS_PATIENT}
    </p>
  );
}

// ---------- Start: who, what, where, drill ----------

function StartScreen({ onCancel, onStart, signedIn, defaultEnv }) {
  const [patient, setPatient] = useState(undefined); // crew id, null = someone else, undefined = not chosen
  const [env, setEnv] = useState(defaultEnv);
  const [drill, setDrill] = useState(true);
  const chosen = patient !== undefined;

  return (
    <>
      <DrillBand drill={drill} />
      <div className="emg-topbar">
        <label className="emg-where">
          <span>Where are you?</span>
          <select className="emg-select" value={env} onChange={(e) => setEnv(e.target.value)}>
            {Object.values(ENVIRONMENTS).map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="emg-toggle">
          <input type="checkbox" checked={drill} onChange={(e) => setDrill(e.target.checked)} />
          <span>Drill</span>
        </label>
      </div>

      <div className="emg-body">
        <h2 id="emg-title" className="emg-title">
          <EmergencyIcon size={28} /> Who needs help?
        </h2>
        <div className="emg-tiles" role="radiogroup" aria-label="Who needs help?">
          {crewRoster.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={patient === c.id} className={`emg-tile${patient === c.id ? ' is-on' : ''}`} onClick={() => setPatient(c.id)}>
              {c.name}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={patient === null} className={`emg-tile emg-tile--other${patient === null ? ' is-on' : ''}`} onClick={() => setPatient(null)}>
            Someone else / not sure
          </button>
        </div>

        <h2 className="emg-title emg-title--sub">What is happening?</h2>
        {!chosen && <p className="emg-hint">Choose who needs help first.</p>}
        <div className="emg-what">
          <button type="button" className="emg-btn emg-btn--big emg-btn--red" disabled={!chosen} onClick={() => onStart({ patientCrewId: patient, flow: 'chest_pain', environment: env, drill })}>
            {FLOWS.chest_pain.label}
          </button>
          <button type="button" className="emg-btn emg-btn--big emg-btn--red" disabled={!chosen} onClick={() => onStart({ patientCrewId: patient, flow: 'collapse', environment: env, drill })}>
            {FLOWS.collapse.label}
          </button>
        </div>
        {!signedIn && <p className="emg-hint">You are not signed in: you are reported as “Unknown crew” and this is saved on this device only.</p>}
        <button type="button" className="emg-btn emg-btn--ghost emg-cancel" onClick={onCancel}>
          Cancel (nothing recorded yet)
        </button>
      </div>
    </>
  );
}

// ---------- One step per screen ----------

function StepAction({ step, em, act, ctx }) {
  const { isCmo, crewId, delivery, canExam, profile } = ctx;
  const [busy, setBusy] = useState(false);
  if (step.action === 'alert') {
    const label = em.flow === 'collapse' ? 'Alert the crew' : 'Alert the CMO';
    const sent = em.events.filter((e) => e.type === 'alert_sent').at(-1);
    const where = delivery[em.id];
    return (
      <div className="emg-action">
        <button
          type="button"
          className="emg-btn emg-btn--big emg-btn--red"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await act.alert();
            setBusy(false);
          }}
        >
          {busy ? 'Sending…' : label}
        </button>
        {sent && (
          <p className="emg-status" role="status">
            Alert logged at {timeOf(sent.at)}.{' '}
            {where === 'server'
              ? 'Sent to the onboard server: the CMO sees it within about 15 seconds.'
              : 'Saved on this device only (offline or not signed in): shout for the CMO.'}
          </p>
        )}
      </div>
    );
  }
  if (step.action === 'exam') {
    if (cmoIsPatient(em)) return <p className="emg-status emg-status--alert">{CMO_IS_PATIENT}</p>;
    if (!em.patient_crew_id) return <p className="emg-status">The patient is not identified, so no exam form can be opened.</p>;
    if (isCmo && em.patient_crew_id !== crewId && canExam) {
      return (
        <div className="emg-action">
          <button type="button" className="emg-btn emg-btn--big" onClick={() => act.recordExam(em.patient_crew_id)}>
            Record an exam for {firstName(em.patient_crew_id)}
          </button>
        </div>
      );
    }
    return <p className="emg-status">The CMO does this. Make sure the CMO is on the way.</p>;
  }
  if (step.action === 'delay') return <DelayLine profile={profile} />;
  if (step.action === 'position') {
    return (
      <div className="emg-positions">
        {POSITIONS[em.environment].map((p) => (
          <div key={p.id} className="emg-position">
            <CprFigure figure={p.figure} />
            <p className="emg-step__text emg-step__text--md">{p.text}</p>
            {p.note && <p className="emg-note">{p.note}</p>}
            <StepSource source={p.source} />
          </div>
        ))}
        <button type="button" className="emg-btn emg-btn--big emg-btn--red" onClick={act.startCompressions}>
          Start compressions
        </button>
      </div>
    );
  }
  return null;
}

function StepScreen({ em, act, ctx, index, setIndex }) {
  const steps = em.flow === 'collapse' ? COLLAPSE_STEPS : CHEST_PAIN_STEPS;
  const i = Math.min(index, steps.length - 1);
  const step = steps[i];
  const textRef = useRef(null);
  useEffect(() => {
    textRef.current?.focus();
  }, [i, em.flow]);

  return (
    <div className="emg-step">
      <p className="emg-step__count">
        {FLOWS[em.flow].label} · Step {i + 1} of {em.flow === 'collapse' ? COLLAPSE_TOTAL : steps.length}
        {step.who === 'cmo' && <span className="emg-tag">CMO</span>}
      </p>
      <p ref={textRef} tabIndex={-1} className="emg-step__text">
        {step.text}
      </p>
      {step.action !== 'position' && <StepSource source={step.source} />}
      <StepAction step={step} em={em} act={act} ctx={ctx} />
      {step.action === 'position' && <StepSource source={step.source} />}
      <div className="emg-nav">
        <button type="button" className="emg-btn emg-btn--ghost" onClick={() => setIndex(i - 1)} disabled={i === 0}>
          Back
        </button>
        {step.action !== 'position' && (
          <button type="button" className="emg-btn emg-btn--ghost" onClick={() => setIndex(i + 1)} disabled={i === steps.length - 1}>
            Next
          </button>
        )}
      </div>
      {em.flow === 'chest_pain' && (
        <button type="button" className="emg-btn emg-btn--big emg-btn--red emg-collapsed" onClick={act.collapse}>
          They collapsed
        </button>
      )}
    </div>
  );
}

// ---------- Live view, end, summary ----------

function EventLog({ em }) {
  return (
    <ol className="emg-log" aria-label="Event log">
      {em.events.map((e) => (
        <li key={e.id} className="emg-log__item">
          <time dateTime={e.at} className="num">
            {timeOf(e.at)}
          </time>{' '}
          {EVENT_LABELS[e.type]}
          {e.detail ? `: ${e.detail}` : ''}
          {e.by ? ` · ${firstName(e.by)}` : ''}
        </li>
      ))}
    </ol>
  );
}

export function CopySummary({ text }) {
  const [done, setDone] = useState(null);
  const areaRef = useRef(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone('Copied.');
    } catch {
      areaRef.current?.select();
      try {
        setDone(document.execCommand('copy') ? 'Copied.' : 'Select the text and copy it.');
      } catch {
        setDone('Select the text and copy it.');
      }
    }
  }
  return (
    <div className="emg-summary">
      <button type="button" className="emg-btn emg-btn--big" onClick={copy}>
        Copy summary for flight surgeon
      </button>
      <p className="emg-status" role="status">
        {done}
      </p>
      <textarea ref={areaRef} className="emg-summary__text" readOnly value={text} rows={14} aria-label="Summary for the flight surgeon" />
    </div>
  );
}

function LiveView({ em, act, ctx, summary, mine }) {
  const { isCmo, crewId, canExam, profile } = ctx;
  return (
    <div className="emg-body">
      <h2 id="emg-title" className="emg-title">
        {em.patient_crew_id ? firstName(em.patient_crew_id) : 'Someone else'} · {FLOWS[em.flow].label}
      </h2>
      <p className="emg-muted">
        Started {timeOf(em.started_at)} by {em.reporter.name} · {ENVIRONMENTS[em.environment].label}
        {em.ended_at ? ` · ended ${timeOf(em.ended_at)}` : ''}
        {!em.on_server ? ' · on this device only' : ''}
      </p>
      <EventLog em={em} />
      <p className="emg-status">
        A message takes {shortDelay(profile.delayText)} to reach Earth. <span className="emg-muted">({profile.delayText})</span>
      </p>
      <div className="emg-actions">
        {!em.ended_at && isCmo && canExam && em.patient_crew_id && em.patient_crew_id !== crewId && (
          <button type="button" className="emg-btn emg-btn--big" onClick={() => act.recordExam(em.patient_crew_id)}>
            Record an exam
          </button>
        )}
        {!em.ended_at && ctx.canAct && (
          <button type="button" className="emg-btn emg-btn--big emg-btn--red" onClick={() => act.show('guide')}>
            Open the guide
          </button>
        )}
      </div>
      <CopySummary text={summary} />
      <div className="emg-nav">
        {mine && !em.ended_at ? (
          <button type="button" className="emg-btn emg-btn--ghost" onClick={() => act.show('guide')}>
            Back to the guide
          </button>
        ) : (
          <button type="button" className="emg-btn emg-btn--ghost" onClick={act.close}>
            Back to the app
          </button>
        )}
        {!em.ended_at && ctx.canAct && (
          <button type="button" className="emg-btn emg-btn--end" onClick={() => act.show('end')}>
            End emergency
          </button>
        )}
      </div>
    </div>
  );
}

function EndScreen({ act, back }) {
  const [note, setNote] = useState('');
  return (
    <div className="emg-body">
      <h2 id="emg-title" className="emg-title">
        End emergency
      </h2>
      <label className="emg-label" htmlFor="emg-note">
        Note (optional)
      </label>
      <textarea id="emg-note" className="emg-textarea" rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="emg-nav">
        <button type="button" className="emg-btn emg-btn--ghost" onClick={() => act.show(back)}>
          Back
        </button>
        <button type="button" className="emg-btn emg-btn--end" onClick={() => act.end(note)}>
          End emergency
        </button>
      </div>
    </div>
  );
}

// ---------- The overlay ----------

export default function EmergencyGuide() {
  const e = useEmergency();
  const onboard = useOnboard();
  const { view, actions, byId, delivery, summaryFor, canRecordExam } = e;
  const em = view?.id ? byId(view.id) : null;
  const ref = useRef(null);
  const audioRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [cpr, setCpr] = useState(() => Boolean(em && hasCompressions(em)));

  // Escape never closes the guide.
  useFocusTrap(ref, { onEscape: () => {} });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    setIndex(0);
    setCpr(Boolean(em && hasCompressions(em)));
  }, [view?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ref.current?.scrollTo?.(0, 0);
  }, [index, cpr, view?.mode, em?.flow]);

  const profile = getProfile(e.profileId());
  const who = { crewId: onboard.crewId, isCmo: onboard.isCmo };
  const ctx = {
    ...who,
    delivery,
    canExam: canRecordExam(),
    profile,
    canAct: em ? canAct(em, who) : false,
  };
  const mine = em ? !em.reporter.crew_id || em.reporter.crew_id === onboard.crewId : false;

  const act = em && {
    log: (type, detail) => actions.log(em.id, type, detail),
    alert: () => actions.alert(em.id),
    collapse: () => {
      actions.collapse(em.id);
      setIndex(0);
    },
    startCompressions: () => {
      // This tap is the user gesture browsers need before audio can start.
      try {
        audioRef.current ??= new (window.AudioContext || window.webkitAudioContext)();
        audioRef.current.resume?.();
      } catch {
        audioRef.current = null;
      }
      actions.log(em.id, 'compressions_started');
      setCpr(true);
    },
    recordExam: actions.recordExam,
    show: (mode) => actions.show(mode, em.id),
    end: (note) => actions.end(em.id, note),
    close: actions.close,
  };

  let body;
  if (view.mode === 'start' || !em) {
    body = (
      <StartScreen
        onCancel={actions.cancelStart}
        onStart={actions.start}
        signedIn={Boolean(onboard.account)}
        defaultEnv={environmentFor(e.profileId())}
      />
    );
  } else if (view.mode === 'summary' || (em.ended_at && view.mode !== 'live')) {
    body = (
      <>
        <DrillBand drill={em.drill} />
        <div className="emg-body">
          <h2 id="emg-title" className="emg-title">
            Emergency ended
          </h2>
          <EventLog em={em} />
          <CopySummary text={summaryFor(em)} />
          <button type="button" className="emg-btn emg-btn--ghost" onClick={actions.close}>
            Close
          </button>
        </div>
      </>
    );
  } else if (view.mode === 'live' || !ctx.canAct) {
    body = (
      <>
        <DrillBand drill={em.drill} />
        <CmoPatientNote em={em} />
        <LiveView em={em} act={act} ctx={ctx} summary={summaryFor(em)} mine={mine} />
      </>
    );
  } else if (view.mode === 'end') {
    body = (
      <>
        <DrillBand drill={em.drill} />
        <EndScreen act={act} back={mine ? 'guide' : 'live'} />
      </>
    );
  } else {
    body = (
      <>
        <DrillBand drill={em.drill} />
        <div className="emg-topbar">
          <h2 id="emg-title" className="emg-topbar__title">
            <EmergencyIcon size={22} /> {em.patient_crew_id ? firstName(em.patient_crew_id) : 'Someone else'}
          </h2>
          <label className="emg-where">
            <span>Where are you?</span>
            <select className="emg-select" value={em.environment} onChange={(ev) => actions.setEnvironment(em.id, ev.target.value)}>
              {Object.values(ENVIRONMENTS).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="emg-btn emg-btn--ghost" onClick={() => act.show('live')}>
            Log &amp; summary
          </button>
          <button type="button" className="emg-btn emg-btn--end" onClick={() => act.show('end')}>
            End emergency
          </button>
        </div>
        <CmoPatientNote em={em} />
        <div className="emg-body">
          {cpr && em.flow === 'collapse' ? (
            <CprScreen em={em} act={act} audioRef={audioRef} profile={profile} onEnd={() => act.show('end')} />
          ) : (
            <StepScreen em={em} act={act} ctx={ctx} index={index} setIndex={setIndex} />
          )}
        </div>
      </>
    );
  }

  return (
    <div ref={ref} className="emg-overlay" role="dialog" aria-modal="true" aria-labelledby="emg-title" tabIndex={-1}>
      <div className="emg-frame">{body}</div>
    </div>
  );
}
