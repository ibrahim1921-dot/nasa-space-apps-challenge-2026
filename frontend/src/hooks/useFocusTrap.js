import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keeps keyboard focus inside `ref` while mounted.
 * - Focuses the first focusable element on open.
 * - Tab / Shift+Tab wrap around inside the container.
 * - Esc calls `onEscape`.
 * - On unmount, focus goes to `getReturnTarget()` (or whatever had focus before).
 */
export function useFocusTrap(ref, { onEscape, getReturnTarget } = {}) {
  // Keep the latest callbacks without re-running the effect.
  const handlers = useRef({ onEscape, getReturnTarget });
  handlers.current = { onEscape, getReturnTarget };

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const previouslyFocused = document.activeElement;
    const focusables = () => [...node.querySelectorAll(FOCUSABLE)];

    (focusables()[0] ?? node).focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        handlers.current.onEscape?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!node.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const target = handlers.current.getReturnTarget?.() ?? previouslyFocused;
      target?.focus?.();
    };
  }, [ref]);
}
