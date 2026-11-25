import { useCallback, useEffect, useState } from "react";
import { listProjects, type ProjectSummary } from "@/lib/api";
import { readCache, writeCache } from "@/lib/sideCache";

// The student's projects, most recently active first. A failed load shows no list: the sidebar's chats do not depend on it.
// enabled=false skips the request (the sidebar is hidden, or the caller already has the list); a new `refresh` value asks again.
export function useProjects(enabled = true, refresh = ""): { projects: ProjectSummary[]; reload: () => void } {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [version, setVersion] = useState(0);
  // After a hard reload the last list shows until the fresh one lands. Read after mount, so the server and first client render agree.
  useEffect(() => {
    const cached = readCache<ProjectSummary[]>("projects");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setProjects(current => current.length ? current : cached);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void listProjects().then(list => { if (active) { setProjects(list); writeCache("projects", list); } }, () => {});
    return () => { active = false; };
  }, [enabled, refresh, version]);
  const reload = useCallback(() => setVersion(v => v + 1), []);
  return { projects, reload };
}
