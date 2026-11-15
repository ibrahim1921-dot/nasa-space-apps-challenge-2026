'use client';

import { useEffect, useRef, useState } from 'react';
import { useOnboard } from '../hooks/useOnboard.jsx';
import { canViewOthers } from '../lib/permissions.js';
import { STATUS_LABELS } from '../constants/status.js';
import StatusIcon from './StatusIcon.jsx';

/**
 * Header menu. Crew: their name and Sign out only. The Crew Medical Officer also gets "Switch view":
 * Crew overview, My data and each crew member, all viewed as herself, read only. Nobody can sign in as
 * someone else from here: to try another person, sign out and pick their door on the landing page.
 * Escape or a click outside closes it; Escape returns focus to the button.
 * @param {{ viewMenu?: { items: { id, label, status?, note? }[], currentId: string, onView: (id: string) => void } | null }} props
 */
export default function AccountMenu({ viewMenu = null }) {
  const { account, signOut, busy } = useOnboard();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const switcher = canViewOthers(account?.role) && viewMenu ? viewMenu : null;
  const close = (focus) => {
    setOpen(false);
    if (focus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close(true);
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
    <div className="account-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`btn btn--secondary account-menu__toggle${switcher ? ' account-menu__toggle--cmo' : ''}`}
        aria-expanded={open}
        aria-controls="account-menu-list"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
      >
        {busy ? 'Signing out…' : (
          <>
            {account?.firstName ?? 'Account'}
            {switcher && <span className="account-menu__switch-word">Switch view</span>}
          </>
        )}
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul id="account-menu-list" className="account-menu__list">
          {switcher && (
            <>
              <li className="account-menu__section" aria-hidden="true">
                Switch view
              </li>
              {switcher.items.map((item) => {
                const current = item.id === switcher.currentId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`account-menu__item${current ? ' is-current' : ''}`}
                      aria-current={current ? 'true' : undefined}
                      aria-label={`Switch view: ${item.label}${item.status ? `, ${STATUS_LABELS[item.status]}` : ''}${current ? ', current view' : ''}`}
                      onClick={() => {
                        close(true);
                        switcher.onView(item.id);
                      }}
                    >
                      <span className="account-menu__name">
                        <span className="account-menu__check" aria-hidden="true">
                          {current ? '✓' : ''}
                        </span>
                        {item.label}
                        {item.status && (
                          <span className={`account-menu__status status-text--${item.status}`}>
                            <StatusIcon status={item.status} size={14} />
                            {STATUS_LABELS[item.status]}
                          </span>
                        )}
                      </span>
                      {item.note && <span className="account-menu__title">{item.note}</span>}
                    </button>
                  </li>
                );
              })}
            </>
          )}
          <li>
            <button
              type="button"
              className="account-menu__item account-menu__item--signout"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
            >
              Sign out
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
