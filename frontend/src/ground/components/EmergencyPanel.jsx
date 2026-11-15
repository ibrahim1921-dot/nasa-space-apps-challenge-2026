'use client';

import { useRef, useState } from 'react';
import { Icon, utcText } from './GroundBits.jsx';

function Emergency({ em, onCompose }) {
  const [copied, setCopied] = useState(null);
  const pre = useRef(null);
  const details = useRef(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(em.summary);
      setCopied('Summary copied.');
    } catch {
      // No clipboard access: show the text selected so it can be copied by hand.
      if (details.current) details.current.open = true;
      const range = document.createRange();
      range.selectNodeContents(pre.current);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      setCopied('Copy blocked by the browser: the summary is selected below, press Ctrl+C.');
    }
  };

  const kind = em.drill ? 'drill' : 'real';
  return (
    <article className={`gr-card gr-em${em.open ? ` gr-em--${kind}` : ''}`} aria-labelledby={`gr-em-${em.id}`}>
      <header className="gr-em__head">
        <h3 id={`gr-em-${em.id}`}>
          {em.drill && <span className="gr-tag gr-tag--drill">DRILL</span>} {em.patientName} · {em.flow}
        </h3>
        {em.open ? (
          <span className={`gr-tag gr-tag--${kind}`}>
            <Icon name="warning" /> Open
          </span>
        ) : (
          <span className="gr-tag gr-tag--ended">
            <Icon name="ended" /> Ended {utcText(em.ended_at)}
          </span>
        )}
      </header>
      <p className="gr-muted">
        Reported by {em.reporterName} · {em.environment} · started {utcText(em.started_at)}
        {em.cmoIsPatient && ' · the CMO is the patient'}
      </p>

      <h4>Event timeline</h4>
      <ol className="gr-timeline">
        {em.events.map((e) => (
          <li key={e.id}>
            <span className="gr-timeline__since num">{e.since}</span>
            <span className="gr-timeline__label">
              {e.label}
              {e.detail && <span>: {e.detail}</span>}
            </span>
            <span className="gr-muted">
              logged by {e.by} · {utcText(e.at)}
            </span>
          </li>
        ))}
      </ol>

      <div className="gr-em__actions">
        <button type="button" className="gr-btn" onClick={copy}>
          Copy summary
        </button>
        <button
          type="button"
          className="gr-btn gr-btn--primary"
          onClick={() =>
            onCompose({
              to: 'cmo',
              subject: `${em.drill ? 'DRILL · ' : ''}About the emergency: ${em.patientName}, ${em.flow}`,
              priority: em.drill ? 'routine' : 'urgent',
              related: { kind: 'emergency', id: em.id },
            })
          }
        >
          Reply to CMO about this
        </button>
        <span className="gr-muted" role="status">
          {copied}
        </span>
      </div>
      <details ref={details} className="gr-em__summary">
        <summary>Handoff summary</summary>
        <pre ref={pre}>{em.summary}</pre>
      </details>
    </article>
  );
}

export default function EmergencyPanel({ emergencies, onCompose }) {
  const open = emergencies.filter((e) => e.open);
  const recent = emergencies.filter((e) => !e.open);
  return (
    <section aria-labelledby="gr-em-title">
      <div className="gr-section-head">
        <h2 id="gr-em-title">Emergencies</h2>
        <p className="gr-muted">
          {open.length} open · {recent.length} ended in the last 7 days · read only, updated every 5 s. Event times use the real clock.
        </p>
      </div>
      {!emergencies.length && <p className="gr-card gr-panel gr-muted">No open or recent emergencies in this browser.</p>}
      {open.map((em) => (
        <Emergency key={em.id} em={em} onCompose={onCompose} />
      ))}
      {recent.length > 0 && <h3 className="gr-subhead">Recently ended</h3>}
      {recent.map((em) => (
        <Emergency key={em.id} em={em} onCompose={onCompose} />
      ))}
    </section>
  );
}
