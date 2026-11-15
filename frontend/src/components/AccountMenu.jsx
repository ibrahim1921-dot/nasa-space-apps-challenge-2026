'use client';

import { useEffect, useRef, useState } from 'react';
import { useOnboard } from '../hooks/useOnboard.jsx';

/** Account disclosure. Escape or a click outside closes it. */
export default function AccountMenu() {
  const { who, signOut, busy } = useOnboard();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    setOpen(false);
  }, [who]);

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
    <div className="account-menu" ref={rootRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn--secondary account-menu__toggle"
        aria-expanded={open}
        aria-controls="account-menu-list"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
      >
        {busy ? 'Signing out...' : 'Account'}
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul id="account-menu-list" className="account-menu__list">
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
