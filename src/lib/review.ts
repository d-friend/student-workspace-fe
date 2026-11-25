import { copy, getLocale } from "./copy";

const dayNumber = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;

// "thứ Năm 27/11": the weekday and the day/month of a YYYY-MM-DD (the student's calendar day, never shifted by a timezone).
export function dayLabel(iso: string): string | null {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (!Number.isFinite(date.getTime())) return null;
  const weekday = new Intl.DateTimeFormat(getLocale() === "vi" ? "vi-VN" : "en-US", { weekday: getLocale() === "vi" ? "long" : "short" }).format(date);
  const lower = getLocale() === "vi" ? weekday.charAt(0).toLowerCase() + weekday.slice(1) : weekday;
  return `${lower} ${d}/${m}`;
}

// The muted line under a review's header: "mai (thứ Năm 27/11)", "còn 3 ngày (thứ Hai 30/11)", "hôm nay"; null once the day has passed.
export function examWhen(iso: string, now = new Date()): string | null {
  const label = dayLabel(iso);
  const [y, m, d] = iso.split("-").map(Number);
  if (!label) return null;
  const days = dayNumber(new Date(y, m - 1, d)) - dayNumber(now);
  if (days < 0) return null;
  if (days === 0) return copy.reviewExamToday;
  return days === 1 ? copy.reviewExamTomorrow(label) : copy.reviewExamIn(days, label);
}

// The URL home reads to start a review session: the message is sent as the student's first one, `via` becomes started_via, `project` files it.
export const reviewUrl = (message: string, via: "review" | "review_chip", projectId: string): string =>
  `/?${new URLSearchParams({ q: message, via, project: projectId })}`;
