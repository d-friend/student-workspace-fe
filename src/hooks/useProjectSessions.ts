import { useCallback, useEffect, useRef, useState } from "react";
import { listSessions, type SessionSummary } from "@/lib/api";

export type ProjectSessions = { sessions: SessionSummary[]; ready: boolean; failed: boolean; hasMore: boolean; loadingMore: boolean; more: () => void };

// One project's sessions, newest first, a page at a time. Loads when first enabled (the Phiên học tab opens), not with the page.
export function useProjectSessions(projectId: string, enabled: boolean): ProjectSessions {
  const [state, setState] = useState<{ id: string; sessions: SessionSummary[]; next: string | null; failed: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    listSessions(undefined, 20, projectId).then(
      page => { if (active) setState({ id: projectId, sessions: page.sessions, next: page.next_before, failed: false }); },
      () => { if (active) setState({ id: projectId, sessions: [], next: null, failed: true }); },
    );
    return () => { active = false; };
  }, [projectId, enabled]);

  const mine = state?.id === projectId ? state : null;
  const next = mine?.next ?? null;
  const more = useCallback(() => {
    if (!next || busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    listSessions(next, 20, projectId).then(
      page => setState(prev => prev && prev.id === projectId
        ? { ...prev, sessions: [...prev.sessions, ...page.sessions.filter(s => !prev.sessions.some(old => old.id === s.id))], next: page.next_before }
        : prev),
      () => {}, // the loaded sessions stay; the button is still there to try again
    ).finally(() => { busy.current = false; setLoadingMore(false); });
  }, [next, projectId]);

  return { sessions: mine?.sessions ?? [], ready: mine !== null, failed: mine?.failed ?? false, hasMore: next !== null, loadingMore, more };
}
