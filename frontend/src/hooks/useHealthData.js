import { useCallback, useEffect, useState } from 'react';

/**
 * Runs an async service call and tracks its state.
 * - `loading` is true only on the first load (nothing to show yet), so render skeletons.
 * - `refreshing` is true while new data loads but the previous data is still on screen.
 *   Callers keep showing the previous data, so there is no skeleton flash on a refetch.
 */
export function useHealthData(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, error: null, pending: true });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, error: null, pending: true }));
    fetcher().then(
      (data) => active && setState({ data, error: null, pending: false }),
      (error) => active && setState((s) => ({ ...s, error, pending: false })),
    );
    return () => {
      active = false;
    };
    // The caller decides when to refetch through `deps`.
  }, [...deps, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const hasData = state.data !== null;
  return {
    data: state.data,
    error: state.error,
    loading: state.pending && !hasData,
    refreshing: state.pending && hasData,
    reload,
  };
}
