import { useCallback, useEffect, useState } from 'react';

/**
 * A small setting remembered in this browser's localStorage.
 * Starts at `fallback` (so server and first client render match), then loads the stored
 * value after mount. `isValid` rejects stale or tampered values. Storage errors are ignored.
 */
export function useStoredSetting(key, fallback, isValid = () => true) {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return;
      const parsed = JSON.parse(raw);
      if (isValid(parsed)) setValue(parsed);
    } catch {
      // blocked or corrupt storage: keep the fallback
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(
    (next) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // the setting still applies for this page view
      }
    },
    [key],
  );

  return [value, update];
}
