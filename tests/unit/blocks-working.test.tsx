import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { copy } from "@/lib/copy";
import { renderBlock } from "@/workspace/blocks";
import type { Block, BlockCtx, CheckResponse, Phase, Workspace, WorkspaceDoc } from "@/workspace/types";
import { WorkspaceView } from "@/workspace/WorkspaceView";

afterEach(cleanup);

const ok: CheckResponse = { ok: true, state: "ok", done: false };
const bad: CheckResponse = { ok: false, state: "review", done: false };
const fin: CheckResponse = { ok: true, state: "ok", done: true };

const ctxWith = (resp: (CheckResponse | Error)[] = [], extra: Partial<BlockCtx> = {}): BlockCtx => {
  const q = [...resp];
  return {
    workspaceId: "w",
    phase: "solve",
    report: vi.fn(),
    check: vi.fn(async () => {
      const r = q.shift() ?? ok;
      if (r instanceof Error) throw r;
      return r;
    }),
    overrides: {},
    hintCount: 0,
    onSolved: vi.fn(),
    ...extra,
  };
};
const steps: Block = { type: "steps", id: "s1", problem_id: "p1", input: "math", help: "Viết một dòng" };
const show = (c: BlockCtx) => render(<>{renderBlock(steps, c)}</>);
const type = (v: string) => fireEvent.change(screen.getByRole("textbox"), { target: { value: v } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: copy.check }));

test("live region is mounted before any result", () => {
  const { container } = show(ctxWith());
  expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
});

test("steps ok line", async () => {
  const c = ctxWith([ok]);
  show(c);
  expect(screen.getByLabelText(copy.lineLabel(1))).toBeTruthy();
  expect(screen.getByText("Viết một dòng")).toBeTruthy();
  type("x=1");
  submit();
  await screen.findByText(copy.stateOk);
  expect(c.report).toHaveBeenCalledWith("line_checked", { block_id: "s1", line: 1, text: "x=1", ok: true, state: "ok", retried: false });
  expect(screen.getByLabelText(copy.lineLabel(2))).toBeTruthy();
});

test("steps review line", async () => {
  show(ctxWith([bad]));
  type("x=2");
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  await screen.findByText(copy.stateReview);
  expect(screen.queryByText(copy.stateOk)).toBeNull();
});

test("network failure keeps line pending", async () => {
  const c = ctxWith([new Error("net"), ok]);
  show(c);
  type("x=1");
  submit();
  await screen.findByText(copy.checkFailed);
  expect(screen.queryByText(copy.stateReview)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.retry }));
  await screen.findByText(copy.stateOk);
  expect(c.check).toHaveBeenCalledTimes(2);
  expect(c.report).toHaveBeenCalledWith("line_checked", expect.objectContaining({ line: 1, retried: true }));
});

test("line remounts when its state changes so the tint replays", async () => {
  const c = ctxWith([bad, ok]);
  const { container } = show(c);
  type("a");
  submit();
  await screen.findByText(copy.stateReview);
  const before = container.querySelector("li");
  type("b");
  submit();
  await screen.findByText(copy.stateOk);
  expect(container.querySelector("li")).not.toBe(before);
});

test("retried after review then ok", async () => {
  const c = ctxWith([bad, ok]);
  show(c);
  type("a");
  submit();
  await screen.findByText(copy.stateReview);
  type("b");
  submit();
  await screen.findByText(copy.stateOk);
  expect(c.report).toHaveBeenLastCalledWith("line_checked", { block_id: "s1", line: 1, text: "b", ok: true, state: "ok", retried: true });
});

test("retried after hint", async () => {
  const c = ctxWith([ok]);
  const { rerender } = show(c);
  rerender(<>{renderBlock(steps, { ...c, hintCount: 1 })}</>);
  type("a");
  submit();
  await screen.findByText(copy.stateOk);
  expect(c.report).toHaveBeenCalledWith("line_checked", expect.objectContaining({ retried: true }));
});

test("override from ctx wins", async () => {
  const c = ctxWith([ok]);
  const { rerender } = show(c);
  type("a");
  submit();
  await screen.findByText(copy.stateOk);
  rerender(<>{renderBlock(steps, { ...c, overrides: { s1: { 1: "review" } } })}</>);
  expect(screen.getByText(copy.stateReview)).toBeTruthy();
  expect(screen.queryByText(copy.stateOk)).toBeNull();
});

test("previous lines passed to check", async () => {
  const c = ctxWith([ok, ok]);
  show(c);
  type("a");
  submit();
  await screen.findByText(copy.stateOk);
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveProperty("disabled", false));
  type("b");
  submit();
  await waitFor(() => expect(c.check).toHaveBeenCalledTimes(2));
  expect(c.check).toHaveBeenLastCalledWith("s1", "b", ["a"]);
});

test("done calls onSolved", async () => {
  const c = ctxWith([fin]);
  show(c);
  type("a");
  submit();
  await waitFor(() => expect(c.onSolved).toHaveBeenCalledWith("s1"));
});

// WorkspaceView-level
const doc = (phase: Phase): WorkspaceDoc => ({
  version: 1,
  phase,
  title: `T-${phase}`,
  sources: [],
  blocks: [
    { type: "problem", id: "p1", md: "Đề thử" },
    { type: "steps", id: `s_${phase}`, problem_id: "p1", input: "text" },
  ],
});
const ws = (p: Phase): Workspace => ({ id: p, doc: doc(p) });
const view = (
  workspaces: Partial<Record<Phase, Workspace>>,
  phase: Phase,
  c: BlockCtx,
  extra: { onPhase?: (p: Phase) => void; taskDone?: Record<string, string[]> } = {},
) => <WorkspaceView workspaces={workspaces} phase={phase} onPhase={extra.onPhase ?? vi.fn()} makeCtx={() => c} taskDone={extra.taskDone ?? {}} />;
const doneCalls = (c: BlockCtx) => (c.report as ReturnType<typeof vi.fn>).mock.calls.filter((a) => a[0] === "task_completed");

test("done reports task_completed once with max_hint and helped", async () => {
  const c = ctxWith([fin]);
  render(view({ solve: ws("solve") }, "solve", c));
  expect(screen.getByText("Đề thử")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: copy.hint }));
  fireEvent.click(screen.getByRole("button", { name: copy.hint }));
  expect(c.report).toHaveBeenCalledWith("help_requested", { block_id: "s_solve", level: 2 });
  type("a");
  submit();
  await screen.findByText(copy.doneTitle);
  expect(doneCalls(c)).toEqual([["task_completed", { similar: false, helped: true, max_hint: 2 }]]);
});

test("taskDone prop reports via master", () => {
  const c = ctxWith();
  const { rerender } = render(view({ solve: ws("solve") }, "solve", c));
  rerender(view({ solve: ws("solve") }, "solve", c, { taskDone: { solve: ["s_solve"] } }));
  expect(screen.getByText(copy.doneTitle)).toBeTruthy();
  rerender(view({ solve: ws("solve") }, "solve", c, { taskDone: { solve: ["s_solve"] } }));
  expect(doneCalls(c)).toEqual([["task_completed", { similar: false, helped: false, max_hint: 0, via: "master" }]]);
});

test("practice doc reports similar true", async () => {
  const c = ctxWith([fin]);
  render(view({ practice: ws("practice") }, "practice", c));
  type("a");
  submit();
  await screen.findByText(copy.doneTitle);
  expect(doneCalls(c)[0][1]).toMatchObject({ similar: true });
});

test("idea button only in solve", () => {
  const c = ctxWith();
  const { unmount } = render(view({ solve: ws("solve") }, "solve", c));
  fireEvent.click(screen.getByRole("button", { name: copy.idea }));
  expect(c.report).toHaveBeenCalledWith("foundation_requested", {});
  unmount();
  render(view({ practice: ws("practice") }, "practice", c));
  expect(screen.queryByRole("button", { name: copy.idea })).toBeNull();
  expect(screen.getByRole("button", { name: copy.hint })).toBeTruthy();
});

test("back to problem reports foundation_done and switches", () => {
  const c = ctxWith();
  const onPhase = vi.fn();
  render(view({ learn: { id: "l", doc: { ...doc("learn"), blocks: [] } }, solve: ws("solve") }, "learn", c, { onPhase }));
  fireEvent.click(screen.getByRole("button", { name: copy.backToProblem }));
  expect(c.report).toHaveBeenCalledWith("foundation_done", {});
  expect(onPhase).toHaveBeenCalledWith("solve");
});
