import { copy, getLocale } from "./copy";
import type { ReviewCard } from "./api";

// "ngày mai" for the next calendar day, else "ngày 3 thg 12". Compares local calendar days, like progressDateLabel.
export function reviewWhen(iso: string, now = new Date()): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  if (day(date) - day(now) <= 1) return copy.reviewTomorrow;
  return copy.reviewOnDate(new Intl.DateTimeFormat(getLocale() === "vi" ? "vi-VN" : "en-US", { month: "short", day: "numeric" }).format(date));
}

// The URL home reads to start a session in the project from a problem card (the Học thêm handoff, plus the card id).
export const similarProblemUrl = (projectId: string, card: ReviewCard): string =>
  `/?${new URLSearchParams({ q: copy.reviewSimilarMessage(card.problem?.excerpt_md ?? card.node_name), via: "review", card: card.id, project: projectId })}`;
