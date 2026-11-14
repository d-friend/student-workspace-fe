import type { ProgressItem } from "./api";
import { copy } from "./copy";
import { stageResults } from "@/workspace/stageResults";

export function progressCards(items: ProgressItem[]): ProgressItem[] {
  return items.filter(item => (item.phase === "solve" || item.phase === "practice") && item.steps?.entries.some(entry => entry.state === "ok"));
}

export function stoppedAt(item: ProgressItem): string | null {
  if (item.phase === "learn" || !item.roadmap || !Object.hasOwn(copy.roadmaps, item.roadmap) || !item.stages || !item.steps) return null;
  const row = stageResults(item.stages, item.steps.entries, item.steps.free).find(row => row.result === "todo");
  return row ? copy.roadmaps[item.roadmap][row.stage] ?? null : null;
}
