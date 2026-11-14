import { resumeSession, type ProgressItem } from "./api";
import { copy } from "./copy";
import { track } from "./track";
import { stageResults } from "@/workspace/stageResults";

export function progressCards(items: ProgressItem[]): ProgressItem[] {
  return items.filter(item => (item.phase === "solve" || item.phase === "practice") && item.steps?.entries.some(entry => entry.state === "ok"));
}

export function openProgressSession(item: ProgressItem, destination: "reload" | "/"): Promise<void> {
  const createdAt = Date.parse(item.created_at);
  const ageDays = Number.isFinite(createdAt) ? Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000)) : 0;
  track("history_session_viewed", { tabs: item.tabs, age_days: ageDays }, item.session_id);
  // A failed resume leaves the current view available, as in the history sidebar.
  return resumeSession(item.session_id).then(() => {
    if (destination === "reload") window.location.reload();
    else window.location.assign(destination);
  }, () => {});
}

export function progressDateLabel(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const now = new Date();
  // Like sidebar grouping, compare local calendar days (also across DST), not elapsed hours.
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  const age = day(now) - day(date);
  return age === 0 ? copy.historyToday : age === 1 ? copy.historyYesterday : `${date.getDate()}/${date.getMonth() + 1}`;
}

export function stoppedAt(item: ProgressItem): string | null {
  if (item.phase === "learn" || !item.roadmap || !Object.hasOwn(copy.roadmaps, item.roadmap) || !item.stages || !item.steps) return null;
  const row = stageResults(item.stages, item.steps.entries, item.steps.free).find(row => row.result === "todo");
  return row ? copy.roadmaps[item.roadmap][row.stage] ?? null : null;
}
