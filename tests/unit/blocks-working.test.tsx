import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { copy } from "@/lib/copy";
import { renderBlock } from "@/workspace/blocks";
import type { Block, BlockCtx, CheckResponse, Phase, Workspace, WorkspaceDoc } from "@/workspace/types";
import { HelpBar } from "@/workspace/HelpBar";
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
    help: null,
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
  expect(c.report).toHaveBeenCalledWith("line_checked", { block_id: "s1", line: 1, text: "x=1", ok: true, state: "ok", retried: false, input: "free" });
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
  expect(c.report).toHaveBeenLastCalledWith("line_checked", { block_id: "s1", line: 1, text: "b", ok: true, state: "ok", retried: true, input: "free" });
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

test("steps stops accepting lines once the task is done", async () => {
  const c = ctxWith([fin]);
  show(c);
  type("x=1");
  submit();
  await screen.findByText(copy.stateOk);
  expect(c.onSolved).toHaveBeenCalledWith("s1");
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: copy.check })).toBeNull();
});

test("the hint level is available to assistive tech without renaming the button", () => {
  render(<HelpBar level={2} onHint={() => {}} />);
  const hint = screen.getByRole("button", { name: copy.hint });
  expect(hint.getAttribute("aria-describedby")).toBeTruthy();
  expect(screen.getByText(copy.hintLevel(2))).toBeTruthy();
});

// Scaffold mode
const scaffolded: Block = {
  ...(steps as Extract<Block, { type: "steps" }>),
  scaffold: [
    { kind: "blank", template: "y′ = ___" },
    { kind: "choice", prompt: "Hệ số góc là", options: ["10", "4"] },
    { kind: "blank", template: "y = ___" },
  ],
};
const showS = (c: BlockCtx) => render(<>{renderBlock(scaffolded, c)}</>);
const gap = (n: number, v: string) => fireEvent.change(screen.getByLabelText(copy.blankLabel(n)), { target: { value: v } });
const lineCalls = (c: BlockCtx) => (c.report as ReturnType<typeof vi.fn>).mock.calls.filter((a) => a[0] === "line_checked");

test("blank item sends the gap and records the filled line", async () => {
  const c = ctxWith([ok]);
  showS(c);
  gap(1, "3x^2-2");
  submit();
  await screen.findByText("y′ = 3x^2-2");
  expect(c.check).toHaveBeenCalledWith("s1", "3x^2-2", [], 0);
  expect(c.report).toHaveBeenCalledWith(
    "line_checked",
    expect.objectContaining({ input: "blank", line: 1, text: "y′ = 3x^2-2" }),
  );
});

test("choice item sends the index and records the option", async () => {
  const c = ctxWith([ok, ok]);
  showS(c);
  gap(1, "3x^2-2");
  submit();
  await screen.findByRole("group", { name: "Hệ số góc là" });
  fireEvent.click(screen.getByRole("button", { name: "10" }));
  await screen.findByText("10");
  expect(c.check).toHaveBeenLastCalledWith("s1", "0", ["y′ = 3x^2-2"], 1);
  expect(lineCalls(c).at(-1)![1]).toMatchObject({ input: "choice", line: 2, text: "10" });
});

test("choice retried after a wrong pick", async () => {
  const c = ctxWith([ok, bad, ok]);
  showS(c);
  gap(1, "a");
  submit();
  fireEvent.click(await screen.findByRole("button", { name: "4" }));
  await screen.findByText(copy.stateReview);
  fireEvent.click(screen.getByRole("button", { name: "10" }));
  await waitFor(() => expect(c.check).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(lineCalls(c)).toHaveLength(3));
  expect(lineCalls(c).at(-1)![1]).toMatchObject({ retried: true, input: "choice" });
});

test("override advances the scaffold", async () => {
  const c = ctxWith([bad]);
  const { rerender } = showS(c);
  gap(1, "a");
  submit();
  await screen.findByText(copy.stateReview);
  expect(screen.queryByRole("group")).toBeNull();
  rerender(<>{renderBlock(scaffolded, { ...c, overrides: { s1: { 1: "ok" } } })}</>);
  expect(screen.getByRole("group", { name: "Hệ số góc là" })).toBeTruthy();
});

test("last item overridden falls back to free", async () => {
  const c = ctxWith([ok, ok, bad]);
  const { rerender } = showS(c);
  gap(1, "a");
  submit();
  fireEvent.click(await screen.findByRole("button", { name: "10" }));
  await screen.findByLabelText(copy.blankLabel(3));
  gap(3, "b");
  submit();
  await screen.findByText(copy.stateReview);
  rerender(<>{renderBlock(scaffolded, { ...c, overrides: { s1: { 3: "ok" } } })}</>);
  expect(screen.getByLabelText(copy.lineLabel(4))).toBeTruthy();
});

test("other way switches to free typing for good", async () => {
  const c = ctxWith([ok, ok]);
  showS(c);
  fireEvent.click(screen.getByRole("button", { name: copy.otherWay }));
  expect(c.report).toHaveBeenCalledWith("other_way_chosen", { block_id: "s1", line: 1 });
  const free = screen.getByLabelText(copy.lineLabel(1));
  expect(document.activeElement).toBe(free);
  fireEvent.change(free, { target: { value: "x" } });
  submit();
  await screen.findByText(copy.stateOk);
  expect(vi.mocked(c.check).mock.calls.at(-1)![3]).toBeUndefined();
  expect(lineCalls(c).at(-1)![1]).toMatchObject({ input: "free" });
  expect(screen.getByLabelText(copy.lineLabel(2))).toBeTruthy();
  expect(screen.queryByRole("group")).toBeNull();
  expect(screen.queryByRole("button", { name: copy.otherWay })).toBeNull();
});

test("help bar sits in the active row", async () => {
  const c = ctxWith([fin]);
  const sc = (extra: Partial<Workspace["doc"]> = {}): Workspace => ({
    id: "solve",
    doc: { ...doc("solve"), blocks: [{ type: "problem", id: "p1", md: "Đề thử" }, scaffolded], ...extra },
  });
  const { unmount } = render(view({ solve: sc() }, "solve", c));
  const hint = screen.getByRole("button", { name: copy.hint });
  expect(hint.closest("[data-pet-anchor]")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: copy.hint })).toHaveLength(1);
  gap(1, "a");
  submit();
  await screen.findByText(copy.doneTitle);
  expect(screen.queryByRole("button", { name: copy.hint })).toBeNull();
  unmount();
  const bare: Workspace = { id: "solve", doc: { ...doc("solve"), blocks: [{ type: "problem", id: "p1", md: "Đề thử" }] } };
  render(view({ solve: bare }, "solve", ctxWith()));
  expect(screen.getByRole("button", { name: copy.hint }).closest("[data-pet-anchor]")).toBeNull();
});
