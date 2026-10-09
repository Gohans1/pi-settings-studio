import { useEffect, useRef, useState } from "react";

// Results outlive the tab that loaded them (Base UI unmounts a tab's panel when another is chosen).
const results = new Map<string, unknown>();

/**
 * Stale-while-revalidate for one slow load. `key` names everything the load reads (undefined: nothing to
 * load). A key loaded before shows its last result at once while it loads again; `refresh()` loads again
 * and passes `fresh`, so the server does not answer with a result it kept.
 */
export function useCached<T>(key: string | undefined, load: (signal: AbortSignal, fresh: boolean) => Promise<T>) {
  const [data, setData] = useState(() => key === undefined ? undefined : results.get(key) as T | undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(key !== undefined);
  const [attempt, setAttempt] = useState(0);
  const fresh = useRef(false);
  useEffect(() => {
    setData(key === undefined ? undefined : results.get(key) as T | undefined);
    setError("");
    setLoading(key !== undefined);
    if (key === undefined) return;
    const controller = new AbortController();
    const asked = fresh.current;
    fresh.current = false;
    load(controller.signal, asked).then(result => {
      if (controller.signal.aborted) return;
      results.set(key, result);
      setData(result);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  // The key names what load reads, so a new load function alone is not a new load.
  }, [key, attempt]);
  return { data, error, loading, refresh() { fresh.current = true; setAttempt(value => value + 1); } };
}
