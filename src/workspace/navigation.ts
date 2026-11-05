import type { Phase } from "./types";

// Live SSE tabs may not carry parent metadata yet; an explicit null always means no parent.
export function canReturnToProblem(phase: Phase, parentId: string | null | undefined, hasSolve: boolean) {
  return phase === "learn" && parentId !== null && hasSolve;
}
