import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

/** GET a JSON endpoint with the signed-in token; refetches when the path or the account changes. */
export function useApi<T>(path: string | null) {
  const { token, ready } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path || !ready) return;
    let live = true; // ignore a response that arrives after the path changed
    api<T>(path, { token })
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [path, token, ready, version]);

  /** Pull-to-refresh: show the spinner and fetch again. */
  const reload = useCallback(() => {
    setLoading(true);
    setVersion((v) => v + 1);
  }, []);

  return { data, error, loading, reload };
}
