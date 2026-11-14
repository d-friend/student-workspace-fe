import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ProgressItem } from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";
import { ProgressCardCompact } from "@/workspace/ProgressCardCompact";
import pills from "@/workspace/ProgressCard.module.css";
import styles from "@/workspace/ProgressCardCompact.module.css";

const item = (extra: Partial<ProgressItem> = {}): ProgressItem => ({
  workspace_id: "w", session_id: "s", phase: "solve", title: "Chuyển động dòng nước", created_at: "2026-11-14T05:00:00Z", tabs: 2,
  roadmap: "motion_current", stages: [0, 1, 2, 3, 4],
  steps: { entries: [
    { item: 0, state: "ok", tries: 1, hint: 0 },
    { item: 1, state: "ok", tries: 2, hint: 2, wrong: "Do not show this reason" },
    { item: 2, state: "ok", tries: 3, hint: 0 },
    { item: 3, state: "review" }, { item: 4, state: "ok" },
  ], done: false, free: false }, quizzes: null, next: null, ...extra,
});
afterEach(() => { cleanup(); setLocale("vi"); vi.useRealTimers(); });

test("each stage name uses the live card's result pill, with short counts, without reasons", () => {
  setLocale("vi");
  render(<ProgressCardCompact variant="entry" item={item()} onOpen={vi.fn()} />);
  ["first", "hint", "fixed", "todo", "unknown"].forEach((result, stage) => {
    const suffixes = ["", " · " + copy.stageHintShort(2), " · " + copy.stageFixedShort(2), " · " + copy.stageTodo, " · " + copy.stageUnknown];
    const pill = screen.getByText(copy.roadmaps.motion_current[stage] + suffixes[stage]);
    expect(pill.classList.contains(pills[result])).toBe(true);
    expect(pill.querySelectorAll("svg")).toHaveLength(stage === 1 || stage === 2 ? 1 : 0);
  });
  expect(screen.queryByText(/Do not show/)).toBeNull();
  expect(screen.queryByText(copy.stageHint(2))).toBeNull();
  expect(screen.queryByText(copy.stageFixed(2))).toBeNull();
  expect(screen.getAllByRole("button")).toHaveLength(1);
});

test("next takes priority over stoppedAt, and the button name is title plus footer", () => {
  const onOpen = vi.fn();
  render(<ProgressCardCompact variant="entry" item={item({ next: ["Học tiếp: Hệ phương trình", "Bài tương tự"] })} onOpen={onOpen} />);
  const button = screen.getByRole("button", { name: "Chuyển động dòng nước Tiếp theo: Học tiếp: Hệ phương trình" });
  expect(screen.queryByText(/Dừng ở:/)).toBeNull();
  expect(screen.queryByText("Bài tương tự")).toBeNull();
  fireEvent.click(button);
  expect(onOpen).toHaveBeenCalledOnce();
});

test.each(["vi", "en"] as const)("entry uses the topic and page uses the session title in %s", locale => {
  setLocale(locale);
  const data = item({ title: "Session title", next: ["Next problem"] });
  const { rerender } = render(<ProgressCardCompact variant="entry" item={data} onOpen={vi.fn()} />);
  expect(screen.getByRole("button", { name: `${copy.roadmapTitle.motion_current} ${copy.progressNext.trim()} Next problem` })).toBeTruthy();
  expect(screen.queryByText("Session title")).toBeNull();
  rerender(<ProgressCardCompact variant="page" item={data} onOpen={vi.fn()} />);
  expect(screen.getByRole("button", { name: `Session title ${copy.progressNext.trim()} Next problem` })).toBeTruthy();
});

test.each([null, "missing", "toString"])("entry falls back to session title for roadmap %s", roadmap => {
  render(<ProgressCardCompact variant="entry" item={item({ title: "Fallback title", roadmap, next: ["Next problem"] })} onOpen={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Fallback title Tiếp theo: Next problem" })).toBeTruthy();
});

test("short pill counts are localized in English", () => {
  setLocale("en");
  render(<ProgressCardCompact variant="page" item={item()} onOpen={vi.fn()} />);
  expect(screen.getByText(`${copy.roadmaps.motion_current[1]} · hint 2`)).toBeTruthy();
  expect(screen.getByText(`${copy.roadmaps.motion_current[2]} · fixed 2`)).toBeTruthy();
  expect(screen.getByText(`${copy.roadmaps.motion_current[3]} · ${copy.stageTodo}`)).toBeTruthy();
  expect(screen.getByText(`${copy.roadmaps.motion_current[4]} · ${copy.stageUnknown}`)).toBeTruthy();
});

test("unfinished work shows stoppedAt and complete work has no footer", () => {
  const data = item();
  const { container, rerender } = render(<ProgressCardCompact variant="entry" item={data} onOpen={vi.fn()} />);
  expect(container.querySelector(`.${styles.done}`)).toBeNull();
  expect(screen.getByRole("button", { name: "Chuyển động dòng nước Dừng ở: Lập phương trình" })).toBeTruthy();
  rerender(<ProgressCardCompact variant="entry" item={{ ...data, next: [], steps: { ...data.steps!, done: true } }} onOpen={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Chuyển động dòng nước" })).toBeTruthy();
  expect(screen.queryByText(/Dừng ở:|Tiếp theo:/)).toBeNull();
  expect(container.querySelector(`.${styles.done}`)).toBeTruthy();
  rerender(<ProgressCardCompact variant="page" item={{ ...data, next: [], steps: { ...data.steps!, done: true } }} onOpen={vi.fn()} />);
  expect(container.querySelector(`.${styles.done}`)).toBeNull();
});

test("accepted rows with no todo stage have no stopped footer even when done is false", () => {
  render(<ProgressCardCompact variant="entry" item={item({ stages: [0] })} onOpen={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Chuyển động dòng nước" })).toBeTruthy();
  expect(screen.queryByText(/Dừng ở:/)).toBeNull();
});

test.each([{ roadmap: null }, { roadmap: "missing" }, { steps: null }, { phase: "learn" as const },
  { steps: { entries: [{ state: "ok" as const }], done: false, free: true } }])("no roadmap rows or stopped footer for %j", extra => {
  render(<ProgressCardCompact variant="entry" item={item(extra)} onOpen={vi.fn()} />);
  expect(screen.queryByText("Chọn ẩn")).toBeNull();
  expect(screen.queryByText(/Dừng ở:/)).toBeNull();
});

test.each(["vi", "en"] as const)("dates use local calendar days and existing labels in %s", locale => {
  setLocale(locale);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 14, 0, 5));
  const data = item({ roadmap: null, title: "**Math** $x^2$" });
  const { container, rerender } = render(<ProgressCardCompact variant="entry" item={{ ...data, created_at: new Date(2026, 10, 14, 0, 1).toISOString() }} onOpen={vi.fn()} />);
  expect(screen.getByText(copy.historyToday)).toBeTruthy();
  expect(container.querySelector("strong")?.textContent).toBe("Math");
  expect(container.querySelector(".katex")).toBeTruthy();
  rerender(<ProgressCardCompact variant="entry" item={{ ...data, created_at: new Date(2026, 10, 13, 23, 59).toISOString() }} onOpen={vi.fn()} />);
  expect(screen.getByText(copy.historyYesterday)).toBeTruthy();
  rerender(<ProgressCardCompact variant="entry" item={{ ...data, created_at: new Date(2026, 9, 2).toISOString() }} onOpen={vi.fn()} />);
  expect(screen.getByText("2/10")).toBeTruthy();
});
