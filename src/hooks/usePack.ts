import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getPack, type Pack } from "@/lib/api";

export const POLL_MS = 1500;
const MAX_FAILURES = 5;
const WORKING = new Set<Pack["status"]>(["extracting", "merging"]);

// One pack, refreshed every POLL_MS while the server is still working on it. needs_subject waits for the student, so it does not poll.
export function usePack(id: string, initial?: Pack): { pack: Pack | null; error: "missing" | "failed" | null; set: (pack: Pack) => void; reload: () => void } {
  const [pack, setPack] = useState<Pack | null>(initial ?? null);
  const [error, setError] = useState<"missing" | "failed" | null>(null);
  const [version, setVersion] = useState(0);
  const failures = useRef(0);
  const working = pack === null || WORKING.has(pack.status);

  useEffect(() => {
    if (!working) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (first: boolean) => {
      try {
        const next = await getPack(id);
        if (!active) return;
        failures.current = 0;
        setError(null);
        setPack(next);
        if (!WORKING.has(next.status)) return;
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 404) return setError("missing");
        if (++failures.current >= MAX_FAILURES) return setError("failed");
      }
      timer = setTimeout(() => void tick(false), first && pack ? 0 : POLL_MS);
    };
    // With an initial pack the first look comes after one interval.
    timer = setTimeout(() => void tick(pack === null), pack === null ? 0 : POLL_MS);
    return () => { active = false; clearTimeout(timer); };
  }, [id, working, version]); // eslint-disable-line react-hooks/exhaustive-deps -- `pack` is read only for the first delay

  const set = useCallback((next: Pack) => { failures.current = 0; setError(null); setPack(next); }, []);
  const reload = useCallback(() => setVersion(v => v + 1), []);
  return { pack, error, set, reload };
}
