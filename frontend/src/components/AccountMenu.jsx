'use client';

import { useEffect, useRef, useState } from 'react';
import { DEMO_ACCOUNTS } from '../lib/demoAccounts.js';
import { useOnboard } from '../hooks/useOnboard.jsx';

/** "Switch / Sign out" disclosure menu in the header. Escape or a click outside closes it. */
export default function AccountMenu() {
  const { who, enter, signOut, busy } = useOnboard();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const others = Object.values(DEMO_ACCOUNTS).filter((a) => a.who !== who);

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
    <div className="account-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn--secondary account-menu__toggle"
        aria-expanded={open}
        aria-controls="account-menu-list"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
      >
        {busy ? 'Signing out…' : 'Switch / Sign out'}
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul id="account-menu-list" className="account-menu__list">
          {others.map((a) => (
            <li key={a.who}>
              <button
                type="button"
                className="account-menu__item"
                onClick={() => {
                  setOpen(false);
                  enter(a.who);
                }}
              >
                {a.button.replace('Enter as', 'Switch to')}
              </button>
            </li>
          ))}
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
