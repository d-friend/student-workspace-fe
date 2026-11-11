import type { Phase, Workspace } from "./types";

// Live SSE tabs may not carry parent metadata yet; an explicit null always means no parent.
export function canReturnToProblem(phase: Phase, parentId: string | null | undefined, hasSolve: boolean) {
  return phase === "learn" && parentId !== null && hasSolve;
}

export function returnTarget(tabs: (Workspace & { phase: Phase })[], w: Workspace): string | null {
  if (w.parent_workspace_id && tabs.some((tab) => tab.id === w.parent_workspace_id)) {
    return w.parent_workspace_id;
  }
  for (let i = tabs.length - 1; i >= 0; i--) {
    if (tabs[i].phase === "solve") return tabs[i].id;
  }
  return null;
}
