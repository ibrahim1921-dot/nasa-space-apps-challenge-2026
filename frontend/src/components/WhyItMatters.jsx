'use client';

// "Why it matters in space" and "What to do" (content/whyItMatters.js): the Vitals section, the one-line
// "Why: …" for the check-in and stand test, and the small "Why?" popover for drawer rows that are not on Vitals.

import { useEffect, useId, useRef, useState } from 'react';
import { firstSentence, whatToDo, whyFor } from '../content/whyItMatters.js';
import { sourceFor } from '../content/limits.js';
import { STATUS_LABELS } from '../constants/status.js';
import StatusIcon from './StatusIcon.jsx';
import { useMission } from '../hooks/useMission.jsx';

/** "Source: Stahn 2017" / "Source: Team-set". */
export function WhySource({ source }) {
  const s = sourceFor(source);
  if (!s) return null;
  const label = s.team_set ? 'Team-set' : s.source_short;
  return (
    <p className="why__source">
      <span className="source-label__key">Source:</span>{' '}
      {s.source_url ? (
        <a href={s.source_url} target="_blank" rel="noopener noreferrer" title={s.source_title}>
          {label}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <span title={s.source_title}>{label}</span>
      )}
    </p>
  );
}

/** "What to do" for a watch or alert result: status icon + word + the steps. Nothing for normal. */
export function WhatToDo({ id, status, titleId }) {
  const { rules } = useMission();
  const base = whatToDo(id, status);
  if (!base.length) return null;
  // On alert, one line on how fast Earth can help in this mission environment (lib/environmentRules.js).
  const steps = status === 'alert' ? [...base, rules.escalation] : base;
  return (
    <section className={`why-todo why-todo--${status}`} aria-labelledby={titleId}>
      <h4 id={titleId} className="why-todo__title">
        <span className={`why-todo__status status-text--${status}`}>
          <StatusIcon status={status} size={16} />
          {STATUS_LABELS[status] ?? status}
        </span>
        What to do
      </h4>
      <ul className="why-todo__list">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <WhySource source="team" />
    </section>
  );
}

/** Vitals detail: "What to do" (watch/alert only), then "Why it matters in space". */
export function WhySection({ id, status }) {
  const entry = whyFor(id);
  const uid = useId();
  if (!entry) return null;
  return (
    <div className="why">
      <WhatToDo id={id} status={status} titleId={`${uid}-todo`} />
      <section className="why__panel" aria-labelledby={`${uid}-why`}>
        <h4 id={`${uid}-why`} className="why__title">
          Why it matters in space
        </h4>
        <p className="why__text">{entry.why}</p>
        <WhySource source={entry.source} />
      </section>
    </div>
  );
}

/** One short line: "Why: <first sentence>" (check-in how-to, stand test intro). */
export function WhyLine({ id, className = '' }) {
  const entry = whyFor(id);
  if (!entry) return null;
  return (
    <p className={`why__line ${className}`}>
      <span className="why__line-key">Why:</span> {firstSentence(entry.why)}
    </p>
  );
}

/** "Why it matters" for the Station details: full text, source, and "What to do" when flagged. */
export function WhyCard({ id, title, status = null }) {
  const entry = whyFor(id);
  const uid = useId();
  if (!entry) return null;
  return (
    <div className="why__station">
      <h3 className="why__title">{title}</h3>
      <p className="why__text">{entry.why}</p>
      <WhySource source={entry.source} />
      <WhatToDo id={id} status={status} titleId={`${uid}-todo`} />
    </div>
  );
}

/**
 * Drawer row "Why?" button. With `onOpen` it opens the reading on Vitals; without, it shows a small
 * popover with the first sentence and its source. The popover closes on Escape (without closing the
 * drawer) and on an outside click; focus returns to the button.
 */
export function WhyButton({ id, name, onOpen = null }) {
  const entry = whyFor(id);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const popRef = useRef(null);
  const uid = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!popRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  if (!entry) return null;
  if (onOpen) {
    return (
      <button type="button" className="link-btn why__btn" onClick={() => onOpen(id)} aria-label={`Why ${name} matters in space: open on Vitals`}>
        Why?
      </button>
    );
  }

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    // Escape on the button or inside the popover closes only the popover (not the drawer around it).
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <span
      className="why__pop-wrap"
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="link-btn why__btn"
        aria-expanded={open}
        aria-controls={`${uid}-pop`}
        aria-label={`Why ${name} matters in space`}
        onClick={() => setOpen((v) => !v)}
      >
        Why?
      </button>
      {open && (
        <div
          ref={popRef}
          id={`${uid}-pop`}
          className="why__pop"
          role="dialog"
          aria-label={`Why ${name} matters in space`}
        >
          <p className="why__text">{firstSentence(entry.why)}</p>
          <WhySource source={entry.source} />
          <button type="button" className="link-btn" onClick={close}>
            Close
          </button>
        </div>
      )}
    </span>
  );
}
