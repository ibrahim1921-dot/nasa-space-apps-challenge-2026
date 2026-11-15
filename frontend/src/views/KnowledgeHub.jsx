'use client';

// Knowledge hub (More → Knowledge hub): nine indicator cards → a detail page. Text comes only from
// content/knowledge.js, which assembles what the app already says; gaps are shown as "TODO: content".

import { useEffect, useRef, useState } from 'react';
import { KNOWLEDGE, TODO, knowledgeFor } from '../content/knowledge.js';
import CountermeasureCard from '../components/CountermeasureCard.jsx';

const isTodo = (v) => v === TODO;

function Field({ title, value, children }) {
  return (
    <section className="kh-section">
      <h3>{title}</h3>
      {children ?? <p className={isTodo(value) ? 'is-todo' : undefined}>{value}</p>}
    </section>
  );
}

function Detail({ entry, onBack }) {
  const headingRef = useRef(null);
  useEffect(() => headingRef.current?.focus(), [entry.id]);
  return (
    <article className="card card--lg kh-detail" aria-labelledby="kh-detail-title">
      <button type="button" className="link-btn kh-back" onClick={onBack}>
        <span aria-hidden="true">←</span> All indicators
      </button>
      <h2 id="kh-detail-title" ref={headingRef} tabIndex={-1} className="view-title">
        {entry.title}
      </h2>
      <Field title="What it measures" value={entry.whatItMeasures} />
      <Field title="Why it matters in space" value={entry.whyInSpace} />
      <Field title="How it is measured">
        {isTodo(entry.howMeasured) ? (
          <p className="is-todo">{TODO}</p>
        ) : (
          <dl className="kh-how">
            {entry.howMeasured.map((h) => (
              <div key={h.label}>
                <dt>{h.label}</dt>
                <dd>{h.text}</dd>
              </div>
            ))}
          </dl>
        )}
      </Field>
      {entry.limits.length > 0 && (
        <Field title="Limits the app checks against">
          <ul className="kh-list">
            {entry.limits.map((l, i) => (
              <li key={i}>
                <strong>{l.level === 'alert' ? 'Alert' : 'Watch'}</strong> · {l.name}: {l.text} <span className="muted">({l.source})</span>
              </li>
            ))}
          </ul>
        </Field>
      )}
      <Field title="Spaceflight effects" value={entry.spaceflightEffects} />
      <Field title="Countermeasures">
        <div className="kh-cms">
          {entry.countermeasures.map((c) => (
            <CountermeasureCard key={c.id} {...c} />
          ))}
        </div>
        {(entry.appSteps.watch.length > 0 || entry.appSteps.alert.length > 0) && (
          <div className="kh-steps">
            <h4>What the app tells you to do</h4>
            {entry.appSteps.watch.length > 0 && <p><strong>On watch:</strong> {entry.appSteps.watch.join(' ')}</p>}
            {entry.appSteps.alert.length > 0 && <p><strong>On alert:</strong> {entry.appSteps.alert.join(' ')}</p>}
          </div>
        )}
      </Field>
      <Field title="References">
        {entry.references.length === 0 ? (
          <p className="is-todo">{TODO}</p>
        ) : (
          <ul className="kh-list">
            {entry.references.map((r) => (
              <li key={`${r.name}-${r.url ?? r.title}`}>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.name}
                  </a>
                ) : (
                  r.name
                )}
                {r.title && <span className="muted">: {r.title}</span>}
                {r.teamSet && <span className="muted"> (the team&apos;s choice, not a published standard)</span>}
              </li>
            ))}
          </ul>
        )}
      </Field>
      <p className="muted kh-foot">General education for the crew, not medical advice and not a diagnosis.</p>
    </article>
  );
}

export default function KnowledgeHub() {
  const [openId, setOpenId] = useState(null);
  const listRef = useRef({});
  const entry = openId ? knowledgeFor(openId) : null;

  if (entry) {
    return (
      <Detail
        entry={entry}
        onBack={() => {
          const id = openId;
          setOpenId(null);
          requestAnimationFrame(() => listRef.current[id]?.focus());
        }}
      />
    );
  }

  return (
    <section className="card card--lg" aria-labelledby="kh-title">
      <h2 id="kh-title" className="view-title">
        Knowledge hub
      </h2>
      <p className="muted">What each reading means, why it matters in space and what helps. Pick an indicator.</p>
      <ul className="kh-grid">
        {KNOWLEDGE.map((k) => (
          <li key={k.id}>
            <button type="button" className="kh-card" ref={(n) => (listRef.current[k.id] = n)} onClick={() => setOpenId(k.id)}>
              <span className="kh-card__title">{k.title}</span>
              <span className="kh-card__text">{isTodo(k.whyInSpace) ? TODO : k.whyInSpace.split(/(?<=[.!?])\s/)[0]}</span>
              <span className="kh-card__more" aria-hidden="true">
                Read more →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
