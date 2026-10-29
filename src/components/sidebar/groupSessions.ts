import type { SessionSummary } from "@/lib/api";

export type SessionGroup = { key: "today" | "yesterday" | "week" | "older"; sessions: SessionSummary[] };

// Compare local calendar dates rather than elapsed 24-hour periods (including DST changes).
const calendarDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;

export function groupSessions(sessions: SessionSummary[], now: Date): SessionGroup[] {
  const groups: SessionGroup[] = ["today", "yesterday", "week", "older"].map(key => ({ key: key as SessionGroup["key"], sessions: [] }));
  for (const session of [...sessions].sort((a, b) => Date.parse(b.last_active_at) - Date.parse(a.last_active_at))) {
    const age = calendarDay(now) - calendarDay(new Date(session.last_active_at));
    groups[age <= 0 ? 0 : age === 1 ? 1 : age <= 7 ? 2 : 3].sessions.push(session);
  }
  return groups.filter(group => group.sessions.length > 0);
}
