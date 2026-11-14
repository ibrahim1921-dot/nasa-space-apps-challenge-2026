'use client';

/** Dismissible success message. `focusRef` lets the parent move focus here after saving. */
export default function Banner({ children, onDismiss, focusRef }) {
  return (
    <div ref={focusRef} className="banner" role="status" tabIndex={-1}>
      <svg className="banner__icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="9" fill="currentColor" />
        <path d="m6 10.5 2.6 2.5L14 7.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="banner__text">{children}</p>
      <button type="button" className="banner__close" onClick={onDismiss} aria-label="Dismiss message">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
