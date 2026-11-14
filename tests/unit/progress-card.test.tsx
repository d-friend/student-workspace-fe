import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { copy, copyFor } from "@/lib/copy";
import { ProgressCard } from "@/workspace/ProgressCard";
import { WorkspaceCopy } from "@/workspace/WorkspaceCopy";
import type { StageResult } from "@/workspace/stageResults";
import styles from "@/workspace/ProgressCard.module.css";

afterEach(cleanup);
const rows: StageResult[] = [
  { stage: 0, result: "first", wrong: "hidden first" },
  { stage: 1, result: "hint", n: 2, wrong: "Cộng $v$ vào vận tốc" },
  { stage: 2, result: "fixed", n: 3, wrong: "Cộng thời gian" },
  { stage: 3, result: "todo", wrong: "hidden todo" },
  { stage: 4, result: "unknown", wrong: "hidden unknown" },
];

test.each(["vi", "en"] as const)("renders stages and all result labels in %s", (locale) => {
  const c = copyFor(locale);
  const { container } = render(<WorkspaceCopy.Provider value={c}><ProgressCard hints={2} roadmap="motion_current" rows={rows} takeaway="Remember this" /></WorkspaceCopy.Provider>);
  expect(screen.getByRole("status")).toBeTruthy();
  expect(screen.getByText(c.doneLabel)).toBeTruthy();
  expect(screen.getByText(c.roadmapTitle.motion_current)).toBeTruthy();
  rows.forEach(({ stage }) => expect(screen.getByText(c.roadmaps.motion_current[stage])).toBeTruthy());
  [c.stageFirst, c.stageHint(2), c.stageFixed(3), c.stageTodo, c.stageUnknown].forEach(label => expect(screen.getByText(label)).toBeTruthy());
  expect(container.querySelector(".katex")).toBeTruthy();
  expect(screen.getByText(/Cộng thời gian/)).toBeTruthy();
  expect(screen.queryByText(/hidden/)).toBeNull();
  expect(screen.getByText(c.takeawayLabel).tagName).toBe("B");
  expect(screen.getByText("Remember this")).toBeTruthy();
  expect(screen.queryByText(c.doneHints(2))).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

test("offer buttons keep the master's labels and order, and call onPick", () => {
  const onPick = vi.fn();
  render(<ProgressCard hints={0} offer={{ opts: ["Học tiếp: Hệ phương trình", "Bài tương tự"], onPick }} />);
  const buttons = screen.getAllByRole("button");
  expect(buttons.map(b => b.textContent)).toEqual(["Học tiếp: Hệ phương trình", "Bài tương tự"]);
  expect(buttons[0].classList.contains(styles.primary)).toBe(true);
  expect(buttons[1].classList.contains(styles.primary)).toBe(false);
  fireEvent.click(buttons[0]);
  fireEvent.click(buttons[1]);
  expect(onPick.mock.calls).toEqual([["Học tiếp: Hệ phương trình"], ["Bài tương tự"]]);
});

test("no rows keeps the takeaway and hint count, with optional offer buttons", () => {
  render(<ProgressCard hints={2} rows={[]} takeaway="Check the units" offer={{ opts: ["Next", "Similar"], onPick: vi.fn() }} />);
  expect(screen.getByText(copy.doneLabel)).toBeTruthy();
  expect(screen.getByText(copy.takeawayLabel).tagName).toBe("B");
  expect(screen.getByText("Check the units")).toBeTruthy();
  expect(screen.getByText(copy.doneHints(2))).toBeTruthy();
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.getAllByRole("button")).toHaveLength(2);
});

test("missing roadmap falls back even if rows are supplied", () => {
  render(<ProgressCard hints={0} rows={rows} />);
  expect(screen.queryByText(copy.stageFirst)).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByText(/Gợi ý đã dùng/)).toBeNull();
});
