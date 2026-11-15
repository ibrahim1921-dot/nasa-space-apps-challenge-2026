'use client';

import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';

/** "Leave this session? It won't be saved." (or the game's own `title`). Escape here means keep going. */
export default function LeaveConfirm({ onLeave, onStay, title = 'Leave this session? It won’t be saved.' }) {
  const ref = useRef(null);
  useFocusTrap(ref, { onEscape: onStay });
  return (
    <div className="act-confirm__backdrop">
      <div ref={ref} className="act-confirm card" role="alertdialog" aria-modal="true" aria-labelledby="act-confirm-title">
        <h3 id="act-confirm-title" className="card__title">
          {title}
        </h3>
        <div className="act-confirm__actions">
          <button type="button" className="btn btn--secondary" onClick={onStay}>
            Keep going
          </button>
          <button type="button" className="btn act-btn" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

/** Calls `onEscape` when Escape is pressed (and no dialog is handling it). */
export function useEscape(onEscape, active = true) {
  const cb = useRef(onEscape);
  cb.current = onEscape;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        cb.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
