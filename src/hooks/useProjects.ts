import { useCallback, useEffect, useState } from "react";
import { listProjects, type ProjectSummary } from "@/lib/api";

// The student's projects, most recently active first. A failed load shows no list: the sidebar's chats do not depend on it.
// enabled=false skips the request (the sidebar is hidden, or the caller already has the list); a new `refresh` value asks again.
export function useProjects(enabled = true, refresh = ""): { projects: ProjectSummary[]; reload: () => void } {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void listProjects().then(list => { if (active) setProjects(list); }, () => {});
    return () => { active = false; };
  }, [enabled, refresh, version]);
  const reload = useCallback(() => setVersion(v => v + 1), []);
  return { projects, reload };
}
