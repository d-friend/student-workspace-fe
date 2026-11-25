import { afterEach, beforeEach, expect, test } from "vitest";
import { copy, setLocale } from "@/lib/copy";
import { dayLabel, examWhen, reviewUrl } from "@/lib/review";

beforeEach(() => setLocale("vi"));
afterEach(() => setLocale("vi"));

const NOW = new Date(2026, 10, 25, 9, 0); // Wed 25 Nov 2026, local

test("the test date reads as mai, còn n ngày, hôm nay, and is hidden once it has passed", () => {
  expect(examWhen("2026-11-26", NOW)).toBe(copy.reviewExamTomorrow("thứ Năm 26/11"));
  expect(examWhen("2026-11-30", NOW)).toBe(copy.reviewExamIn(5, "thứ Hai 30/11"));
  expect(examWhen("2026-11-25", NOW)).toBe(copy.reviewExamToday);
  expect(examWhen("2026-11-24", NOW)).toBeNull();
  expect(examWhen("not a date", NOW)).toBeNull();
});

test("the weekday follows the locale", () => {
  setLocale("en");
  expect(dayLabel("2026-11-26")).toBe("Thu 26/11");
});

test("the review handoff url carries the message, the door and, when known, the project", () => {
  const url = new URL(reviewUrl("Mình muốn ôn tập môn Toán", "review", "p-1"), "http://x");
  expect([url.pathname, url.searchParams.get("q"), url.searchParams.get("via"), url.searchParams.get("project")]).toEqual(["/", "Mình muốn ôn tập môn Toán", "review", "p-1"]);
  expect(new URL(reviewUrl("x", "review_chip"), "http://x").searchParams.has("project")).toBe(false);
});
