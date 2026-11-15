'use client';

// ML assessment: frontend side only. Data from services/assessmentService.js → getAssessment(), which
// returns DEMO DATA (src/mocks/mlAssessment.js) until Augustine's backend endpoint is connected.
// Wording rule: a model output is a prompt for human review, never a diagnosis.

import { useEffect, useState } from 'react';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { getAssessment } from '../services/assessmentService.js';
import { indicatorLabel } from '../services/alertService.js';
import { knowledgeFor } from '../content/knowledge.js';
import CountermeasureCard from '../components/CountermeasureCard.jsx';
import { DemoLabel, Icon, StateMessage, when } from '../components/integration/Bits.jsx';
import { DEMO_ACCOUNT_LIST } from '../lib/demoAccounts.js';

const RISK_WORD = { LOW: 'Low', MODERATE: 'Moderate', ELEVATED: 'Elevated', HIGH: 'High' };
const ANOMALY = {
  NORMAL: { word: 'No unusual pattern', icon: 'resolved', tone: 'resolved' },
  ANOMALY: { word: 'Unusual pattern', icon: 'warning', tone: 'warning' },
};
// Indicator code → Knowledge hub entry, for the countermeasure cards beside the result.
const KH_OF = { sleep_hours: 'sleep', blood_pressure: 'blood-pressure', heart_rate: 'heart-rate' };

function Result({ a }) {
  if (a.state === 'error') {
    return (
      <div className="ix-state ix-state--error" role="alert">
        <p className="ix-state__title">
          <Icon name="warning" size={18} /> Assessment unavailable
        </p>
        <p>{a.message}</p>
      </div>
    );
  }
  if (a.state === 'insufficient') {
    return (
      <div className="ix-state ix-state--empty" role="status">
        <p className="ix-state__title">
          <Icon name="info" size={18} /> Not enough input to assess
        </p>
        {a.missing.length > 0 ? <p>Missing: {a.missing.map(indicatorLabel).join(', ')}.</p> : <p>{a.message}</p>}
      </div>
    );
  }
  const anomaly = a.anomaly ? ANOMALY[a.anomaly.status] ?? { word: a.anomaly.status, icon: 'info', tone: 'info' } : null;
  return (
    <div className="ml-result">
      {a.risk && (
        <section className="ml-block" aria-labelledby="ml-risk">
          <h3 id="ml-risk">Risk class</h3>
          <p className="ml-risk">
            <span className={`ix-chip ix-chip--sev-${a.risk.class === 'LOW' ? 'info' : 'warning'}`}>
              <Icon name={a.risk.class === 'LOW' ? 'info' : 'warning'} size={14} />
              {RISK_WORD[a.risk.class] ?? a.risk.class}
            </span>
            {a.risk.probability !== null && <span className="num muted"> model score {Math.round(a.risk.probability * 100)}%</span>}
          </p>
          {a.risk.explanation.length > 0 && (
            <>
              <h4>Why the model says this</h4>
              <ul className="kh-list">
                {a.risk.explanation.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {anomaly && (
        <section className="ml-block" aria-labelledby="ml-anomaly">
          <h3 id="ml-anomaly">Anomaly check</h3>
          <p>
            <span className={`ix-chip ix-chip--${anomaly.tone}`}>
              <Icon name={anomaly.icon} size={14} />
              {anomaly.word}
            </span>
          </p>
          <dl className="ix-refs">
            <div>
              <dt>Reconstruction error</dt>
              <dd className="num">{a.anomaly.reconstructionError ?? '—'}</dd>
            </div>
            <div>
              <dt>Threshold</dt>
              <dd className="num">{a.anomaly.threshold ?? '—'}</dd>
            </div>
          </dl>
        </section>
      )}
      <p className="muted">A model result is a prompt for a human review by the medical team. It is not a diagnosis.</p>
    </div>
  );
}

export default function Assessment({ roster = null }) {
  const { account, isOfficer } = useOnboard();
  // Officer: anyone on the live roster. Crew/CMO: themselves.
  const people = isOfficer ? roster?.data ?? [] : [{ crewId: account?.crewId, astronautId: account?.astronautId, name: account?.name }];
  const [pick, setPick] = useState('');
  const subject = people.find((p) => p.crewId === pick) ?? people[0] ?? null;
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    if (!subject) return undefined;
    let active = true;
    setState({ loading: true, data: null });
    getAssessment(subject.astronautId, subject.crewId).then((data) => active && setState({ loading: false, data }));
    return () => {
      active = false;
    };
  }, [subject?.astronautId, subject?.crewId]); // eslint-disable-line react-hooks/exhaustive-deps

  const a = state.data;
  const related = ['sleep_hours', ...(a?.missing ?? [])]
    .map((code) => knowledgeFor(KH_OF[code]))
    .filter(Boolean)
    .filter((k, i, list) => list.findIndex((x) => x.id === k.id) === i)
    .slice(0, 2);

  return (
    <section className="card card--lg ml" aria-labelledby="ml-title">
      <h2 id="ml-title" className="view-title">
        ML assessment
      </h2>
      <DemoLabel>Demo data: model not connected yet</DemoLabel>
      {isOfficer && (
        <StateMessage loading={roster?.loading} error={roster?.error} empty={!roster?.loading && people.length === 0} emptyText="No crew to assess.">
          <label className="ix-field ix-field--inline">
            Astronaut
            <select className="input" value={subject?.crewId ?? ''} onChange={(e) => setPick(e.target.value)}>
              {people.map((p) => (
                <option key={p.crewId} value={p.crewId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </StateMessage>
      )}
      {!isOfficer && subject?.name && <p className="muted">For {subject.name}. Same demo examples for every viewer: {DEMO_ACCOUNT_LIST.length} fixed cases.</p>}
      <div className="ml-layout">
        <div>
          <StateMessage loading={state.loading}>
            {a && (
              <>
                {a.model && (
                  <p className="muted ml-meta">
                    Model {a.model.name} · version {a.model.version}
                    {a.assessedAt && (
                      <>
                        {' '}
                        · assessed <time dateTime={a.assessedAt}>{when(a.assessedAt)}</time>
                      </>
                    )}
                  </p>
                )}
                <Result a={a} />
              </>
            )}
          </StateMessage>
        </div>
        <aside className="ml-aside" aria-label="Countermeasures">
          <h3>Countermeasures</h3>
          {related.map((k) => (
            <div key={k.id} className="ml-aside__group">
              <h4>{k.title}</h4>
              {k.countermeasures.map((c) => (
                <CountermeasureCard key={c.id} {...c} />
              ))}
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}
