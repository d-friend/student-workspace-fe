import { useCallback, useEffect, useState } from "react";
import { ApiError, getProject, getReader, type Project, type ReaderPage } from "@/lib/api";

type Loaded<T> = { data: T | null; error: "missing" | "failed" | null; ready: boolean; reload: () => void };

// Loads one thing per key and reloads on demand. A 404 is "missing" (someone else's project or a deleted one), anything else "failed".
function useLoaded<T>(key: string | null, load: (key: string) => Promise<T>): Loaded<T> {
  const [state, setState] = useState<{ key: string; data: T | null; error: "missing" | "failed" | null } | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (key === null) return;
    let active = true;
    load(key).then(
      data => { if (active) setState({ key, data, error: null }); },
      e => { if (active) setState({ key, data: null, error: e instanceof ApiError && e.status === 404 ? "missing" : "failed" }); },
    );
    return () => { active = false; };
  }, [key, version]); // eslint-disable-line react-hooks/exhaustive-deps -- `load` is a module function, stable per hook
  const reload = useCallback(() => setVersion(v => v + 1), []);
  const mine = state?.key === key ? state : null; // never show another project's data while the next one loads
  return { data: mine?.data ?? null, error: mine?.error ?? null, ready: key === null || mine !== null, reload };
}

export const useProject = (id: string) => useLoaded<Project>(id, getProject);

// The Nguồn reader loads when the tab is first opened (enabled), not with the page: it is the heaviest call.
export const useReader = (id: string, enabled: boolean) => useLoaded<ReaderPage[]>(enabled ? id : null, getReader);
