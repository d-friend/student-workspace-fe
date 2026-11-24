import { useEffect, useState } from "react";
import { getReviewCount } from "@/lib/api";

// Cards due per project, for the sidebar badges. A new `refresh` value asks again; a failed load keeps the last counts (no badge at all before the first).
export function useReviewCounts(enabled: boolean, refresh = ""): Record<string, number> {
  const [due, setDue] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    getReviewCount().then(projects => { if (active) setDue(Object.fromEntries(projects.map(p => [p.project_id, p.due]))); }, () => {});
    return () => { active = false; };
  }, [enabled, refresh]);
  return due;
}
