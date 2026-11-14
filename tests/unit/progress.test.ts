import { afterEach, expect, test } from "vitest";
import type { ProgressItem } from "@/lib/api";
import { setLocale } from "@/lib/copy";
import { progressCards, stoppedAt } from "@/lib/progress";

const item = (extra: Partial<ProgressItem> = {}): ProgressItem => ({
  workspace_id: "w", session_id: "s", phase: "solve", title: "Bài toán", created_at: "2026-11-14T05:00:00Z", tabs: 2,
  roadmap: "motion_current", stages: [0, 1, 2],
  steps: { entries: [{ item: 0, state: "ok", tries: 1, hint: 0 }], done: false, free: false },
  quizzes: null, next: null, ...extra,
});
afterEach(() => setLocale("vi"));

test("only accepted solve/practice cards survive, in API order", () => {
  const solve = item();
  const practice = item({ workspace_id: "practice", phase: "practice" });
  const items = [item({ phase: "learn" }), solve, item({ steps: null }),
    item({ steps: { entries: [{ state: "review" }], done: false, free: false } }),
    item({ steps: { entries: [], done: false, free: false } }), practice];
  expect(progressCards(items)).toEqual([solve, practice]);
  expect(items).toHaveLength(6);
  expect(progressCards([])).toEqual([]);
});

test("stoppedAt uses the first todo stage, including a partially accepted stage", () => {
  setLocale("vi");
  expect(stoppedAt(item())).toBe("Lập vận tốc");
  expect(stoppedAt(item({ stages: [0, 0, 1] }))).toBe("Chọn ẩn");
  setLocale("en");
  expect(stoppedAt(item())).toBe("Express speeds");
});

test("stoppedAt has no stage for free work, missing/unknown roadmaps or completed rows", () => {
  expect(stoppedAt(item({ roadmap: null }))).toBeNull();
  expect(stoppedAt(item({ roadmap: "unrecognised" }))).toBeNull();
  expect(stoppedAt(item({ stages: null }))).toBeNull();
  expect(stoppedAt(item({ steps: null }))).toBeNull();
  expect(stoppedAt(item({ phase: "learn" }))).toBeNull();
  expect(stoppedAt(item({ steps: { entries: [], done: false, free: true } }))).toBeNull();
  expect(stoppedAt(item({ stages: [0] }))).toBeNull();
});
