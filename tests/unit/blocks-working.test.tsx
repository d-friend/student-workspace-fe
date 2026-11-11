import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { copy } from "@/lib/copy";
import { renderBlock } from "@/workspace/blocks";
import type { Block, BlockCtx, CheckResponse, Phase, Workspace, WorkspaceDoc } from "@/workspace/types";
import { DoneBanner } from "@/workspace/DoneBanner";
import { HelpBar } from "@/workspace/HelpBar";
import { WorkspaceView } from "@/workspace/WorkspaceView";
import { filledBlank } from "@/workspace/blocks/Steps";
import { track } from "@/lib/track";

vi.mock("@/lib/track", () => ({ track: vi.fn() }));

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
  await screen.findByLabelText(copy.stateOk);
  expect(screen.queryByText(copy.stateOk)).toBeNull();
  expect(c.report).toHaveBeenCalledWith("line_checked", { block_id: "s1", line: 1, text: "x=1", ok: true, state: "ok", retried: false, input: "free" });
  expect(screen.getByLabelText(copy.lineLabel(2))).toBeTruthy();
});

test("steps review line", async () => {
  show(ctxWith([bad]));
  type("x=2");
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  await screen.findByText(copy.stateReview);
  expect(screen.queryByLabelText(copy.stateOk)).toBeNull();
});

test("network failure keeps line pending", async () => {
  const c = ctxWith([new Error("net"), ok]);
  show(c);
  type("x=1");
  submit();
  await screen.findByText(copy.checkFailed);
  expect(screen.queryByText(copy.stateReview)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.retry }));
  await screen.findByLabelText(copy.stateOk);
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
  await screen.findByLabelText(copy.stateOk);
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
  await screen.findByLabelText(copy.stateOk);
  expect(c.report).toHaveBeenLastCalledWith("line_checked", { block_id: "s1", line: 1, text: "b", ok: true, state: "ok", retried: true, input: "free" });
});

test("retried after hint", async () => {
  const c = ctxWith([ok]);
  const { rerender } = show(c);
  rerender(<>{renderBlock(steps, { ...c, hintCount: 1 })}</>);
  type("a");
  submit();
  await screen.findByLabelText(copy.stateOk);
  expect(c.report).toHaveBeenCalledWith("line_checked", expect.objectContaining({ retried: true }));
});

test("override from ctx wins", async () => {
  const c = ctxWith([ok]);
  const { rerender } = show(c);
  type("a");
  submit();
  await screen.findByLabelText(copy.stateOk);
  rerender(<>{renderBlock(steps, { ...c, overrides: { s1: { 1: "review" } } })}</>);
  expect(screen.getByText(copy.stateReview)).toBeTruthy();
  expect(screen.queryByLabelText(copy.stateOk)).toBeNull();
});

test("previous lines passed to check", async () => {
  const c = ctxWith([ok, ok]);
  show(c);
  type("a");
  submit();
  await screen.findByLabelText(copy.stateOk);
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
  extra: { onPhase?: (id: string) => void; taskDone?: Record<string, string[]> } = {},
) => <WorkspaceView tabs={Object.values(workspaces).map((w) => ({ ...w!, phase: w!.doc.phase }))} activeId={workspaces[phase]?.id ?? ""} onActive={extra.onPhase ?? vi.fn()} makeCtx={() => c} taskDone={extra.taskDone ?? {}} />;
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
  await screen.findByText(copy.doneLabel);
  expect(doneCalls(c)).toEqual([["task_completed", { similar: false, helped: true, max_hint: 2 }]]);
});

test("taskDone prop reports via master", () => {
  const c = ctxWith();
  const { rerender } = render(view({ solve: ws("solve") }, "solve", c));
  rerender(view({ solve: ws("solve") }, "solve", c, { taskDone: { solve: ["s_solve"] } }));
  expect(screen.getByText(copy.doneLabel)).toBeTruthy();
  rerender(view({ solve: ws("solve") }, "solve", c, { taskDone: { solve: ["s_solve"] } }));
  expect(doneCalls(c)).toEqual([["task_completed", { similar: false, helped: false, max_hint: 0, via: "master" }]]);
});

test("practice doc reports similar true and exposes the done slots", async () => {
  const c = ctxWith([fin]);
  const { container } = render(view({ practice: ws("practice") }, "practice", c));
  type("a");
  submit();
  await screen.findByText(copy.doneLabel);
  expect(doneCalls(c)[0][1]).toMatchObject({ similar: true });
  expect(container.querySelectorAll("[data-pet-anchor]")).toHaveLength(1);
  expect(container.querySelector("[data-pet-done] [data-pet-slot]")).toBeTruthy();
  expect(container.querySelector("[data-pet-done] [data-pet-spoken-slot]")).toBeTruthy();
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

test("back to problem switches tabs itself and reports foundation_done as local", () => {
  const c = ctxWith();
  const onPhase = vi.fn();
  render(view({ learn: { id: "l", doc: { ...doc("learn"), blocks: [] } }, solve: ws("solve") }, "learn", c, { onPhase }));
  fireEvent.click(screen.getByRole("button", { name: copy.backToProblem }));
  expect(onPhase).toHaveBeenCalledWith("solve");
  expect(c.report).toHaveBeenCalledWith("foundation_done", { local: true });
});

test("steps stops accepting lines once the task is done", async () => {
  const c = ctxWith([fin]);
  show(c);
  type("x=1");
  submit();
  await screen.findByLabelText(copy.stateOk);
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

test("accepted scaffold reasons persist, render math, and track each opening", async () => {
  vi.mocked(track).mockClear();
  const saveBlock = vi.fn();
  const c = ctxWith([{ ...ok, why: "Vì $x^2$ tăng" }], { saveBlock, sessionId: "session-1" });
  const { unmount } = showS(c);
  gap(1, "a");
  submit();
  const toggle = await screen.findByRole("button", { name: copy.lineWhy });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  const reason = document.getElementById(toggle.getAttribute("aria-controls")!);
  expect(reason?.hidden).toBe(true);
  expect(saveBlock).toHaveBeenCalledWith("s1", expect.objectContaining({ entries: [expect.objectContaining({ item: 0, why: "Vì $x^2$ tăng" })] }));
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(reason?.hidden).toBe(false);
  expect(reason?.querySelector(".katex")).toBeTruthy();
  expect(track).toHaveBeenCalledWith("line_why_opened", { block_id: "s1", line: 1 }, "session-1");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(reason?.hidden).toBe(true);
  expect(track).toHaveBeenCalledTimes(1);
  fireEvent.click(toggle);
  expect(track).toHaveBeenCalledTimes(2);
  const saved = saveBlock.mock.calls.at(-1)![1];
  unmount();
  showS(ctxWith([], { state: { blocks: { s1: saved } } }));
  expect(screen.getByRole("button", { name: copy.lineWhy }).getAttribute("aria-expanded")).toBe("false");
});

test("reasons are excluded for review, free, and learn responses", async () => {
  const saveBlock = vi.fn();
  const { unmount } = showS(ctxWith([{ ...bad, why: "reason" }], { saveBlock }));
  gap(1, "a");
  submit();
  await screen.findByText(copy.stateReview);
  expect(screen.queryByRole("button", { name: copy.lineWhy })).toBeNull();
  expect(saveBlock.mock.calls.at(-1)![1].entries[0].why).toBeUndefined();
  unmount();
  const free = show(ctxWith([{ ...ok, why: "reason" }], { saveBlock }));
  type("a");
  submit();
  await screen.findByLabelText(copy.stateOk);
  expect(screen.queryByRole("button", { name: copy.lineWhy })).toBeNull();
  expect(saveBlock.mock.calls.at(-1)![1].entries[0].why).toBeUndefined();
  free.unmount();
  showS(ctxWith([{ ...ok, why: "reason" }], { phase: "learn", saveBlock }));
  gap(1, "a");
  submit();
  await screen.findByText(copy.stateOk);
  expect(screen.queryByRole("button", { name: copy.lineWhy })).toBeNull();
  expect(saveBlock.mock.calls.at(-1)![1].entries[0].why).toBeUndefined();
});

test("saved review entries and entries without reasons have no toggle", () => {
  showS(ctxWith([], { state: { blocks: { s1: { type: "steps", entries: [
    { text: "accepted", state: "ok", item: 0 },
    { text: "review", state: "review", item: 1, why: "reason" },
  ], done: false, free: false } } } }));
  expect(screen.queryByRole("button", { name: copy.lineWhy })).toBeNull();
});

test("solve blank shows its template once and a generic prompt", () => {
  const { container } = showS(ctxWith());
  expect(container.querySelector('[data-sel="prompt"]')?.textContent).toBe(copy.fillBlank);
  expect(container.querySelector("form")?.textContent).toContain("y′ =");
  expect(container.textContent?.match(/y′ =/g)).toHaveLength(1);
  expect(screen.getByLabelText(copy.blankLabel(1))).toBeTruthy();
});

test("solve choice shows its prompt once and names the group", () => {
  const choice: Block = { ...(steps as Extract<Block, { type: "steps" }>), scaffold: [{ kind: "choice", prompt: "Chọn đáp án", options: ["Một", "Hai"] }] };
  render(<>{renderBlock(choice, ctxWith())}</>);
  expect(screen.getAllByText("Chọn đáp án")).toHaveLength(1);
  expect(screen.getByRole("group", { name: "Chọn đáp án" })).toBeTruthy();
});

test("choice labels are ordered and excluded from accessible names", () => {
  const choice: Block = {
    ...(steps as Extract<Block, { type: "steps" }>),
    scaffold: [{ kind: "choice", prompt: "Chọn", options: ["Một", "Hai", "Ba"] }],
  };
  render(<>{renderBlock(choice, ctxWith())}</>);
  const buttons = screen.getByRole("group", { name: "Chọn" }).querySelectorAll("button");
  expect(Array.from(buttons, (button) => button.querySelector('[aria-hidden="true"]')?.textContent)).toEqual(["A", "B", "C"]);
  for (const name of ["Một", "Hai", "Ba"]) {
    expect(screen.getByRole("button", { name: new RegExp(`^${name}$`) })).toBeTruthy();
  }
});

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

test("a wrong choice shows the server's reason at once and says it was explained", async () => {
  const c = ctxWith([ok, { ...bad, message: "Bạn chia ngược." }, { ...bad, message: "Bạn nhân." }, ok]);
  showS(c);
  gap(1, "a");
  submit();
  fireEvent.click(await screen.findByRole("button", { name: "4" }));
  const note = await screen.findByRole("status", { name: "" });
  expect(note.textContent).toBe("Bạn chia ngược.");
  expect(lineCalls(c).at(-1)![1]).toMatchObject({ ok: false, retried: false, input: "choice", explained: true });

  fireEvent.click(screen.getByRole("button", { name: "10" })); // a second wrong pick replaces the note
  await waitFor(() => expect(screen.queryByText("Bạn chia ngược.")).toBeNull());
  expect((await screen.findByText("Bạn nhân.")).getAttribute("role")).toBe("status");
  expect(lineCalls(c).at(-1)![1]).toMatchObject({ retried: true, explained: true });

  fireEvent.click(screen.getByRole("button", { name: "10" })); // accepted: the note goes
  await waitFor(() => expect(screen.queryByText("Bạn nhân.")).toBeNull());
  expect(lineCalls(c).at(-1)![1]).not.toHaveProperty("explained");
});

test("a wrong choice without a reason shows no note and sends no explained flag", async () => {
  const c = ctxWith([ok, bad, { ...bad, message: "   " }]);
  showS(c);
  gap(1, "a");
  submit();
  fireEvent.click(await screen.findByRole("button", { name: "4" }));
  await screen.findByText(copy.stateReview);
  expect(lineCalls(c).at(-1)![1]).not.toHaveProperty("explained");
  fireEvent.click(screen.getByRole("button", { name: "10" }));
  await waitFor(() => expect(lineCalls(c)).toHaveLength(3));
  expect(lineCalls(c).at(-1)![1]).not.toHaveProperty("explained");
  expect(document.querySelectorAll('p[role="status"]').length).toBe(0);
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
  const workspace: Workspace = { id: "solve", doc: { ...doc("solve"), blocks: [scaffolded] } };
  render(view({ solve: workspace }, "solve", c));
  fireEvent.click(screen.getByRole("button", { name: copy.otherWay }));
  expect(c.report).toHaveBeenCalledWith("other_way_chosen", { block_id: "s1", line: 1 });
  const free = screen.getByLabelText(copy.lineLabel(1));
  expect(document.activeElement).toBe(free);
  fireEvent.change(free, { target: { value: "x" } });
  submit();
  await screen.findByLabelText(copy.stateOk);
  expect(vi.mocked(c.check).mock.calls.at(-1)![3]).toBeUndefined();
  expect(lineCalls(c).at(-1)![1]).toMatchObject({ input: "free" });
  expect(screen.getByLabelText(copy.lineLabel(2))).toBeTruthy();
  expect(screen.queryByRole("group")).toBeNull();
  expect(screen.queryByRole("button", { name: copy.otherWay })).toBeNull();
});

test("action bar is the last doc child and contains all active actions", async () => {
  const c = ctxWith([fin]);
  const sc = (extra: Partial<Workspace["doc"]> = {}): Workspace => ({
    id: "solve",
    doc: { ...doc("solve"), blocks: [{ type: "problem", id: "p1", md: "Đề thử" }, scaffolded], ...extra },
  });
  const { unmount } = render(view({ solve: sc() }, "solve", c));
  const hint = screen.getByRole("button", { name: copy.hint });
  const bar = hint.closest("[data-action-bar]")!;
  expect(bar.parentElement?.lastElementChild).toBe(bar);
  expect(bar.contains(screen.getByRole("button", { name: copy.idea }))).toBe(true);
  expect(bar.contains(screen.getByRole("button", { name: copy.otherWay }))).toBe(true);
  fireEvent.click(hint);
  expect(screen.getByText(copy.hintLevel(1))).toBeTruthy();
  expect(hint.querySelectorAll('[aria-hidden="true"] span')).toHaveLength(3);
  expect(c.report).toHaveBeenCalledWith("help_requested", { block_id: "s1", level: 1 });
  fireEvent.click(screen.getByRole("button", { name: copy.idea }));
  expect(c.report).toHaveBeenCalledWith("foundation_requested", {});
  expect(screen.getAllByRole("button", { name: copy.hint })).toHaveLength(1);
  gap(1, "a");
  submit();
  await screen.findByText(copy.doneLabel);
  expect(screen.queryByRole("button", { name: copy.hint })).toBeNull();
  unmount();
  const bare: Workspace = { id: "solve", doc: { ...doc("solve"), blocks: [{ type: "problem", id: "p1", md: "Đề thử" }] } };
  render(view({ solve: bare }, "solve", ctxWith()));
  expect(screen.getByRole("button", { name: copy.hint }).closest("[data-pet-anchor]")).toBeNull();
});

test("the choice prompt is visible text and still names the group", async () => {
  showS(ctxWith([ok]));
  gap(1, "a");
  submit();
  expect((await screen.findByText("Hệ số góc là")).tagName).toBe("P");
  expect(screen.getByRole("group", { name: "Hệ số góc là" })).toBeTruthy();
});

test("focus stays in the choice group after a wrong pick", async () => {
  const c = ctxWith([ok, bad]);
  showS(c);
  gap(1, "a");
  submit();
  fireEvent.click(await screen.findByRole("button", { name: "4" }));
  await screen.findByText(copy.stateReview);
  const group = screen.getByRole("group", { name: "Hệ số góc là" });
  await waitFor(() => expect(group.contains(document.activeElement)).toBe(true));
  expect(document.activeElement?.tagName).toBe("BUTTON");
});

test("done banner shows the label and the hints used", () => {
  render(<DoneBanner hints={2} />);
  expect(screen.getByRole("status")).toBeTruthy();
  expect(screen.getByText("Xong bài")).toBeTruthy();
  expect(screen.getByText(copy.doneHints(2))).toBeTruthy();
});

test("done banner omits the hint line when no hint was used", () => {
  render(<DoneBanner hints={0} />);
  expect(screen.getByText("Xong bài")).toBeTruthy();
  expect(screen.queryByText(/Gợi ý đã dùng/)).toBeNull();
});

test("done banner counts the hints pressed", async () => {
  const c = ctxWith([fin]);
  render(view({ solve: ws("solve") }, "solve", c));
  fireEvent.click(screen.getByRole("button", { name: copy.hint }));
  type("a");
  submit();
  await screen.findByText("Xong bài");
  expect(screen.getByText(copy.doneHints(1))).toBeTruthy();
});

test("choice options render $math$, and typed stars stay literal", async () => {
  const withMath: Block = {
    ...(steps as Extract<Block, { type: "steps" }>),
    scaffold: [{ kind: "choice", prompt: "Chọn $\\dfrac{h^3}{h}$", options: ["$\\dfrac{a}{b}$", "2*x+3*y"] }],
  };
  const { container } = render(<>{renderBlock(withMath, ctxWith())}</>);
  expect(container.querySelectorAll(".katex").length).toBe(2);
  expect(container.textContent).not.toContain("$");
  expect(container.querySelector("em")).toBeNull();
  expect(screen.getByText("2*x+3*y")).toBeTruthy();
});


test("progress follows saved accepted scaffold entries", async () => {
  function Harness() {
    const [state, setState] = useState<Workspace["state"]>(null);
    const workspace: Workspace = { id: "solve", state, doc: { ...doc("solve"), blocks: [scaffolded] } };
    const c = ctxWith([ok], { saveBlock: (id, saved) => setState((previous) => ({ ...previous, blocks: { ...previous?.blocks, [id]: saved } })) });
    return view({ solve: workspace }, "solve", c);
  }
  render(<Harness />);
  expect(screen.getByText("Bước 1/3")).toBeTruthy();
  gap(1, "2");
  submit();
  expect(await screen.findByText("Bước 2/3")).toBeTruthy();
});

test("problem collapses after an accepted line and can be expanded", async () => {
  const workspace = ws("solve");
  workspace.doc.blocks[0] = { type: "problem", id: "p1", md: "Tìm 12 và $x$.", image: { src: "/problem.png", alt: "Hình đề" } };
  render(view({ solve: workspace }, "solve", ctxWith([ok])));
  expect(screen.getByAltText("Hình đề")).toBeTruthy();
  expect(screen.queryByRole("button", { name: copy.expandProblem })).toBeNull();
  type("a");
  submit();
  const toggle = await screen.findByRole("button", { name: copy.expandProblem });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(toggle.querySelectorAll("mark")).toHaveLength(2);
  expect(screen.queryByAltText("Hình đề")).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: copy.collapseProblem }).getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText(/Tìm 12 và/)).toBeTruthy();
  expect(screen.getByAltText("Hình đề")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: copy.collapseProblem }));
  expect(screen.getByRole("button", { name: copy.expandProblem }).getAttribute("aria-expanded")).toBe("false");
});

test.each(["solve", "practice"] as const)("restored %s problem starts collapsed", (phase) => {
  const workspace = ws(phase);
  workspace.state = { blocks: { [`s_${phase}`]: { type: "steps", entries: [{ text: "a", state: "ok" }], done: false, free: false } } };
  render(view({ [phase]: workspace }, phase, ctxWith()));
  expect(screen.getByRole("button", { name: copy.expandProblem }).getAttribute("aria-expanded")).toBe("false");
});

test("learn problems never collapse even with saved accepted entries", () => {
  const workspace = ws("learn");
  workspace.state = { blocks: { s_learn: { type: "steps", entries: [{ text: "a", state: "ok" }], done: false, free: false } } };
  render(view({ learn: workspace }, "learn", ctxWith()));
  expect(screen.getByText("Đề thử")).toBeTruthy();
  expect(screen.queryByRole("button", { name: copy.expandProblem })).toBeNull();
});

test("an override of a saved review line collapses the problem", () => {
  const workspace = ws("solve");
  workspace.state = { blocks: { s_solve: { type: "steps", entries: [{ text: "a", state: "review" }], done: false, free: false } } };
  render(view({ solve: workspace }, "solve", ctxWith([], { overrides: { s_solve: { 1: "ok" } } })));
  expect(screen.getByRole("button", { name: copy.expandProblem })).toBeTruthy();
});


test.each(["solve", "practice"] as const)("%s steps expose inline slots until finished", (phase) => {
  const c = ctxWith([], { phase });
  const { container, rerender } = render(<>{renderBlock(scaffolded, c)}</>);
  const anchor = container.querySelector("[data-pet-anchor][data-pet-inline]")!;
  expect(anchor.querySelector("[data-pet-slot]")).toBeTruthy();
  expect(anchor.querySelector("[data-pet-spoken-slot]")).toBeTruthy();
  rerender(<>{renderBlock(scaffolded, { ...c, finished: true })}</>);
  expect(container.querySelector("[data-pet-slot]")).toBeNull();
  expect(container.querySelector("[data-pet-spoken-slot]")).toBeNull();
});

test("learn steps keep the lane anchor without inline slots", () => {
  const { container } = showS(ctxWith([], { phase: "learn" }));
  expect(container.querySelector("[data-pet-anchor]")).toBeTruthy();
  expect(container.querySelector("[data-pet-inline]")).toBeNull();
  expect(container.querySelector("[data-pet-slot]")).toBeNull();
});

test("completing the final answer removes the inline slots", async () => {
  const { container } = showS(ctxWith([fin]));
  expect(container.querySelector("[data-pet-slot]")).toBeTruthy();
  gap(1, "2");
  submit();
  await waitFor(() => expect(container.querySelector("[data-pet-slot]")).toBeNull());
});

test("accepted choices save the returned line and fall back to the option text", async () => {
  const block: Block = { type: "steps", id: "s1", problem_id: "p1", input: "text", scaffold: [
    { kind: "choice", prompt: "First?", options: ["First option", "Other"] },
    { kind: "choice", prompt: "Second?", options: ["Second option", "Other"] },
  ] };
  const saveBlock = vi.fn();
  const c = ctxWith([{ ...ok, line: "Solution line" }, ok], { saveBlock });
  render(<>{renderBlock(block, c)}</>);
  fireEvent.click(screen.getByRole("button", { name: "First option" }));
  await screen.findByText("Solution line");
  fireEvent.click(screen.getByRole("button", { name: "Second option" }));
  await waitFor(() => expect(saveBlock).toHaveBeenLastCalledWith("s1", expect.objectContaining({ entries: [
    expect.objectContaining({ text: "Solution line" }), expect.objectContaining({ text: "Second option" }),
  ] })));
  expect(c.check).toHaveBeenLastCalledWith("s1", "0", ["Solution line"], 1);
});

test("blank entries keep the filled template even when a line is returned", async () => {
  const c = ctxWith([{ ...fin, line: "Ignored", takeaway: "Remember this" }], { saveBlock: vi.fn() });
  showS(c);
  gap(1, "2");
  submit();
  await waitFor(() => expect(c.saveBlock).toHaveBeenCalledWith("s1", expect.objectContaining({
    entries: [expect.objectContaining({ text: expect.stringContaining("2") })], takeaway: "Remember this", done: true,
  })));
  expect(screen.queryByText("Ignored")).toBeNull();
});

test("filled blank joins math spans and preserves the raw fallback", () => {
  expect(filledBlank("$y_0 = $", "$ units$", "1/ln2", "\\frac{1}{\\ln 2}")).toBe("$y_0 = $ $\\frac{1}{\\ln 2}$ $ units$");
  expect(filledBlank("Answer: ", " units", "1/ln2", "\\frac{1}{\\ln 2}")).toBe("Answer: $\\frac{1}{\\ln 2}$ units");
  expect(filledBlank("$y_0 = ", "$", "1/ln2", "\\frac{1}{\\ln 2}")).toBe("$y_0 = \\frac{1}{\\ln 2}$");
  expect(filledBlank("$y_0 = $", "", " 1/ln2 ")).toBe("$y_0 = $ 1/ln2 ");
});

test("accepted blank saves formatted math and restores it", async () => {
  const block: Block = { ...(steps as Extract<Block, { type: "steps" }>), scaffold: [{ kind: "blank", template: "$y_0 = $___" }] };
  const saveBlock = vi.fn();
  const c = ctxWith([{ ...fin, answer_tex: "\\frac{1}{\\ln 2}" }], { saveBlock });
  const { container, unmount } = render(<>{renderBlock(block, c)}</>);
  gap(1, "1/ln2");
  submit();
  await waitFor(() => expect(saveBlock).toHaveBeenCalled());
  const saved = saveBlock.mock.calls[0][1];
  expect(saved.entries[0]).toMatchObject({ text: "$y_0 = $ $\\frac{1}{\\ln 2}$", answer: "1/ln2" });
  expect(container.querySelectorAll(".katex")).toHaveLength(2);
  unmount();
  const restored = render(<>{renderBlock(block, ctxWith([], { state: { blocks: { s1: saved } } }))}</>);
  expect(restored.container.querySelectorAll(".katex")).toHaveLength(2);
});

test.each(["review", "learn", "free"] as const)("%s keeps student text raw even with answer_tex", async (mode) => {
  const block: Block = { ...(steps as Extract<Block, { type: "steps" }>), scaffold: [{ kind: "blank", template: "Answer: ___" }] };
  const saveBlock = vi.fn();
  const c = ctxWith([{ ...ok, state: mode === "review" ? "review" : "ok", answer_tex: "\\frac{1}{2}" }], {
    saveBlock, phase: mode === "learn" ? "learn" : "solve",
    ...(mode === "free" ? { help: { level: 0, onHint: vi.fn(), ideaPending: false, free: true } } : {}),
  });
  render(<>{renderBlock(block, c)}</>);
  type("1/2");
  submit();
  await waitFor(() => expect(saveBlock).toHaveBeenCalled());
  expect(saveBlock.mock.calls[0][1].entries[0].text).toBe(mode === "free" ? "1/2" : "Answer: 1/2");
});

test("takeaway and topic appear after completion and after restoration", async () => {
  const workspace = ws("solve");
  const block = workspace.doc.blocks.find((b) => b.type === "steps")!;
  if (block.type !== "steps") throw new Error("missing steps");
  block.roadmap = "motion_current";
  const c = ctxWith([{ ...fin, takeaway: "Use the time relation" }]);
  const { unmount } = render(view({ solve: workspace }, "solve", c));
  type("a");
  submit();
  expect(await screen.findByText(copy.takeaway("Use the time relation"))).toBeTruthy();
  expect(screen.getByText(copy.roadmapTitle.motion_current)).toBeTruthy();
  unmount();
  workspace.state = { blocks: { [block.id]: { type: "steps", entries: [{ text: "a", state: "ok" }], done: true, free: false, takeaway: "Use the time relation" } } };
  render(view({ solve: workspace }, "solve", ctxWith()));
  expect(screen.getByText(copy.takeaway("Use the time relation"))).toBeTruthy();
  expect(screen.getByText(copy.roadmapTitle.motion_current)).toBeTruthy();
});

test("a banner without takeaway has no topic tag", () => {
  render(<DoneBanner hints={0} roadmap="motion_current" />);
  expect(screen.getByText(copy.doneLabel)).toBeTruthy();
  expect(screen.queryByText(copy.roadmapTitle.motion_current)).toBeNull();
  expect(screen.queryByText(/Điều cần nhớ/)).toBeNull();
});


test("master completion has no takeaway or topic", () => {
  const workspace = ws("solve");
  const block = workspace.doc.blocks.find((b) => b.type === "steps");
  if (block?.type !== "steps") throw new Error("missing steps");
  block.roadmap = "motion_current";
  render(view({ solve: workspace }, "solve", ctxWith(), { taskDone: { solve: [block.id] } }));
  expect(screen.getByText(copy.doneLabel)).toBeTruthy();
  expect(screen.queryByText(copy.roadmapTitle.motion_current)).toBeNull();
  expect(screen.queryByText(/Điều cần nhớ/)).toBeNull();
});

test("drag-selecting an option does not answer", () => {
  const c = ctxWith();
  const choice: Block = { ...(steps as Extract<Block, { type: "steps" }>), scaffold: [{ kind: "choice", prompt: "Pick", options: ["10", "4"] }] };
  render(<>{renderBlock(choice, c)}</>);
  const button = screen.getByRole("button", { name: "10" });
  const selection = vi.spyOn(window, "getSelection").mockReturnValue({ isCollapsed: false, anchorNode: button } as unknown as Selection);
  fireEvent.click(button);
  expect(c.check).not.toHaveBeenCalled();
  selection.mockRestore();
});

test("a pending PATCH question locks the active step's controls until it is answered", async () => {
  const choice: Block = { ...(steps as Extract<Block, { type: "steps" }>), scaffold: [{ kind: "choice", prompt: "Chọn", options: ["Một", "Hai"] }] };
  const c = ctxWith([ok], { askPending: true });
  const { rerender } = render(<>{renderBlock(choice, c)}</>);
  const options = () => screen.getByRole("group", { name: "Chọn" }).querySelectorAll("button");
  expect(Array.from(options()).every((b) => b.disabled)).toBe(true);
  fireEvent.click(options()[0]!);
  expect(c.check).not.toHaveBeenCalled();
  rerender(<>{renderBlock(choice, { ...c, askPending: false })}</>);
  expect(Array.from(options()).every((b) => !b.disabled)).toBe(true);
  fireEvent.click(options()[0]!);
  await waitFor(() => expect(c.check).toHaveBeenCalledTimes(1));
});

test("a pending PATCH question locks the blank input and its Check, then focuses it on unlock", () => {
  const c = ctxWith([], { askPending: true });
  const { rerender } = showS(c);
  expect((screen.getByLabelText(copy.blankLabel(1)) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: copy.check }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<>{renderBlock(scaffolded, { ...c, askPending: false })}</>);
  const input = screen.getByLabelText(copy.blankLabel(1)) as HTMLInputElement;
  expect(input.disabled).toBe(false);
  expect(document.activeElement).toBe(input);
});

test("a pending PATCH question locks the free line, and nothing locks in learn", () => {
  const { unmount } = show(ctxWith([], { askPending: true }));
  expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: copy.check }) as HTMLButtonElement).disabled).toBe(true);
  unmount();
  show(ctxWith([], { askPending: true, phase: "learn" }));
  expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(false);
});

test("a queued answer waits out a pending PATCH question, then replays", async () => {
  const c = ctxWith([ok], { askPending: true, queued: { blockId: "s1", answer: "5", text: "5", input: "free" } as never });
  const { rerender } = show(c);
  expect(c.check).not.toHaveBeenCalled();
  rerender(<>{renderBlock(steps, { ...c, askPending: false })}</>);
  await waitFor(() => expect(c.check).toHaveBeenCalledTimes(1));
});
