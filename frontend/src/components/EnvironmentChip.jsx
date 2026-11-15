'use client';

import { useEffect, useRef, useState } from 'react';
import { MISSION_PROFILES } from '../constants/mission.js';
import { environmentFacts } from '../lib/environmentRules.js';
import { useMission } from '../hooks/useMission.jsx';
import { WhySource } from './WhyItMatters.jsx';
import EnvironmentIcon from './EnvironmentIcon.jsx';

/** A fact's source line: a content/limits.js key or 'team' via WhySource, a plain label, or nothing. */
function FactSource({ source }) {
  if (!source) return null;
  if (typeof source === 'object') {
    return (
      <p className="why__source">
        <span className="source-label__key">Source:</span> {source.label}
      </p>
    );
  }
  return <WhySource source={source} />;
}

/**
 * Header chip: where the crew are ("Moon base · 0.17 g"). Opens a small panel with the setting, gravity,
 * signal delay, help time and radiation line, each with its source. Only the CMO gets "Change environment".
 * Escape or a click outside closes it; Escape returns focus to the chip.
 */
export default function EnvironmentChip() {
  const { profile, canChange, setProfile } = useMission();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const facts = environmentFacts(profile);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div className="env-chip" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="env-chip__toggle"
        aria-expanded={open}
        aria-controls="env-chip-panel"
        aria-label={`Mission environment: ${profile.shortLabel}. Show details`}
        onClick={() => setOpen((v) => !v)}
      >
        <EnvironmentIcon setting={profile.setting} size={16} />
        <span className="env-chip__label">{profile.shortLabel}</span>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id="env-chip-panel" className="env-chip__panel" role="region" aria-label="Mission environment">
          <p className="env-chip__title">
            <EnvironmentIcon setting={profile.setting} size={18} />
            {profile.title}
          </p>
          <dl className="env-chip__facts">
            {facts.map((f) => (
              <div key={f.id} className="env-chip__fact">
                <dt>{f.label}</dt>
                <dd>
                  {f.value}
                  <FactSource source={f.source} />
                </dd>
              </div>
            ))}
          </dl>
          {canChange ? (
            <label className="env-chip__change">
              <span>Change environment</span>
              <select className="input env-chip__select" value={profile.id} onChange={(e) => setProfile(e.target.value)}>
                {MISSION_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="env-chip__note muted">The Crew Medical Officer sets the mission environment.</p>
          )}
        </div>
      )}
    </div>
  );
}
