import { useSyncExternalStore } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { usePet } from "@/hooks/usePet";
import { createWorkspace } from "@/hooks/useWorkspace";
import { currentSession, putWorkspaceState } from "@/lib/api";
import { copy } from "@/lib/copy";
import { WorkspaceView } from "@/workspace/WorkspaceView";
import { Quiz } from "@/workspace/blocks/Quiz";
import { Steps } from "@/workspace/blocks/Steps";
import { fixtures } from "@/workspace/fixtures";
import type { Block, BlockCtx, StudentWork, WorkspaceDoc } from "@/workspace/types";

const quiz: Extract<Block, { type: "quiz" }> = { type: "quiz", id: "q1", question_md: "Pick", answer: "choice", options: ["A", "B"], explanation_md: "Explanation" };
const steps: Extract<Block, { type: "steps" }> = { type: "steps", id: "s1", problem_id: "p1", input: "text", scaffold: [{ kind: "blank", template: "x = ___" }, { kind: "choice", prompt: "Next", options: ["C", "D"] }] };
const doc: WorkspaceDoc = { version: 1, phase: "solve", title: "Work", blocks: [quiz, steps], sources: [] };
const quizState = { type: "quiz" as const, tries: 1, done: false, text: "", selected: "B", answered: { option: "B", ok: false } };
const stepsState = { type: "steps" as const, entries: [{ text: "x = 2", answer: "2", item: 0, state: "ok" as const }], done: false, free: false };
const saved: StudentWork = { blocks: { q1: quizState, s1: stepsState }, overrides: { s1: { 1: "review" } }, taskDone: [] };

function ctx(state?: StudentWork): BlockCtx {
  return { workspaceId: "w1", phase: "solve", state, report: vi.fn(), check: vi.fn().mockResolvedValue({ ok: true, state: "ok", done: false }), overrides: {}, hintCount: 0, onSolved: vi.fn(), help: null, saveBlock: vi.fn() };
}

function controller(state?: StudentWork) {
  const api = {
    createGuest: vi.fn().mockResolvedValue({ guestId: "g", created: false }),
    currentSession: vi.fn().mockResolvedValue({ sessionId: "s", messages: [], html: null, tabs: [{ id: "w1", phase: "solve", doc, state }], activeId: "w1" }),
    createSession: vi.fn(), endSession: vi.fn(), turn: vi.fn(), turnStatus: vi.fn(), check: vi.fn(), setActiveWorkspace: vi.fn(),
    putWorkspaceState: vi.fn().mockResolvedValue(undefined),
  };
  const ws = createWorkspace({ api, track: vi.fn(), readPhoto: vi.fn() });
  ws.init();
  return { ws, api };
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("debounces committed block snapshots together and restores without saving", async () => {
  vi.useFakeTimers();
  const { ws, api } = controller(saved);
  await vi.advanceTimersByTimeAsync(0);
  expect(ws.getState().tabs[0].state).toEqual(saved);
  expect(ws.getState().overrides.w1).toEqual(saved.overrides);
  expect(api.putWorkspaceState).not.toHaveBeenCalled();
  ws.actions.setInput("typing does not save");
  await vi.advanceTimersByTimeAsync(1000);
  expect(api.putWorkspaceState).not.toHaveBeenCalled();
  ws.actions.saveBlock("w1", "q1", quizState);
  await vi.advanceTimersByTimeAsync(500);
  ws.actions.saveBlock("w1", "s1", stepsState);
  await vi.advanceTimersByTimeAsync(799);
  expect(api.putWorkspaceState).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(api.putWorkspaceState).toHaveBeenCalledExactlyOnceWith("w1", saved);
});

it("flushes committed work before a new problem clears its tabs", async () => {
  vi.useFakeTimers();
  const { ws, api } = controller();
  api.endSession.mockResolvedValue(undefined);
  await vi.advanceTimersByTimeAsync(0);
  ws.actions.saveBlock("w1", "q1", quizState);
  ws.actions.newProblem();
  await vi.advanceTimersByTimeAsync(0);
  expect(api.putWorkspaceState).toHaveBeenCalledWith("w1", { blocks: { q1: quizState }, overrides: {}, taskDone: [] });
  expect(ws.getState().tabs).toEqual([]);
});

it("restores a quiz selection and verdict and keeps the remaining attempt", async () => {
  const context = ctx(saved);
  render(<Quiz block={quiz} ctx={context} />);
  expect(screen.getByRole("radio", { name: /B/ }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByText(copy.stateReview)).toBeTruthy();
  expect(context.saveBlock).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole("radio", { name: "A" })); });
  expect(context.saveBlock).toHaveBeenCalledWith("q1", { type: "quiz", tries: 2, done: true, text: "", selected: "A", answered: { option: "A", ok: true } });
});

it("saves typed/open answers only on submission", () => {
  const context = ctx();
  render(<Quiz block={{ ...quiz, answer: "open" }} ctx={context} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "My answer" } });
  expect(context.saveBlock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: copy.answer }));
  expect(context.saveBlock).toHaveBeenCalledWith("q1", { type: "quiz", tries: 1, done: true, text: "My answer", selected: null, answered: null });
});

it("restores a typed quiz answer", () => {
  const context = ctx({ blocks: { q1: { ...quizState, text: "42", selected: "42", answered: { option: "42", ok: true }, done: true } } });
  render(<Quiz block={{ ...quiz, answer: "number" }} ctx={context} />);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("42");
  expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
});

it("restores committed scaffold lines and saves the next answer with its verdict", async () => {
  const context = ctx({ blocks: { s1: stepsState } });
  render(<Steps block={steps} ctx={context} />);
  expect(screen.getByText("x = 2")).toBeTruthy();
  expect(screen.getByLabelText(copy.stateOk)).toBeTruthy();
  expect(context.saveBlock).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "C" })); });
  expect(context.saveBlock).toHaveBeenCalledWith("s1", { type: "steps", entries: [...stepsState.entries, { text: "C", state: "ok", answer: "0", item: 1, tries: 1, hint: 0 }], done: false, free: false });
});

it("completes a scaffolded proof without showing free input, even after an override", async () => {
  const block = fixtures["solve-proof.json"].blocks[1] as Extract<Block, { type: "steps" }>;
  const context = ctx();
  vi.mocked(context.check).mockImplementation(async (_id, _answer, _previous, item) => ({
    ok: true, state: "ok", done: item === 2, line: `Proof line ${item}`,
  }));
  const { rerender } = render(<Steps block={block} ctx={context} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  for (const option of ["Cân tại A", "Tính chất tam giác cân", "Góc B bằng góc C"]) {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: option })); });
    expect(screen.queryByRole("textbox")).toBeNull();
  }
  expect(context.onSolved).toHaveBeenCalledWith("s1");
  expect(screen.getByText("Proof line 2")).toBeTruthy();
  const overridden = ctx({ blocks: { s1: { type: "steps", entries: [0, 1, 2].map(() => ({ text: "line", state: "ok" as const })), done: false, free: true } } });
  rerender(<Steps key="override" block={block} ctx={overridden} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("button", { name: "Góc B bằng góc C" })).toBeTruthy();
});

it("does not save draft step keystrokes", () => {
  const context = ctx();
  render(<Steps block={steps} ctx={context} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "2" } });
  expect(context.saveBlock).not.toHaveBeenCalled();
});

it("carries state through the reload API and sends JSON with PUT", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ session_id: "s", messages: [], tabs: [{ workspace_id: "w1", phase: "solve", doc, state: saved }], active_workspace_id: "w1" })))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  expect((await currentSession())?.tabs[0].state).toEqual(saved);
  await putWorkspaceState("w1", saved);
  expect(fetch).toHaveBeenLastCalledWith("/api/workspaces/w1/state", expect.objectContaining({ method: "PUT", body: JSON.stringify({ state: saved }), headers: { "content-type": "application/json" } }));
});

it("serializes saves so an earlier response cannot overwrite newer work", async () => {
  vi.useFakeTimers();
  const { ws, api } = controller();
  await vi.advanceTimersByTimeAsync(0);
  let finish!: () => void;
  api.putWorkspaceState.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  ws.actions.saveBlock("w1", "q1", quizState);
  await vi.advanceTimersByTimeAsync(800);
  ws.actions.saveBlock("w1", "q1", { ...quizState, tries: 2, done: true });
  await vi.advanceTimersByTimeAsync(800);
  expect(api.putWorkspaceState).toHaveBeenCalledTimes(1);
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(api.putWorkspaceState).toHaveBeenCalledTimes(2);
  expect((api.putWorkspaceState.mock.calls[1] as unknown as [string, StudentWork])[1].blocks?.q1).toEqual({ ...quizState, tries: 2, done: true });
});

it("redraws restored tab work without reporting completion or saving again", () => {
  const context = ctx();
  const state: StudentWork = { blocks: { q1: { ...quizState, done: true }, s1: { ...stepsState, done: true } } };
  render(<WorkspaceView tabs={[{ id: "w1", phase: "solve", doc, state, restored: true }]} activeId="w1" onActive={vi.fn()} makeCtx={() => context} />);
  expect(screen.getByRole("radio", { name: /B/ }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByText("x = 2")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "C" })).toBeNull();
  expect(context.report).not.toHaveBeenCalled();
  expect(context.saveBlock).not.toHaveBeenCalled();
});


it("a wrong scaffold choice drives PATCH to doubt; a correct retry celebrates", async () => {
  vi.useFakeTimers();
  const { ws, api } = controller();
  await vi.advanceTimersByTimeAsync(0);
  api.check.mockResolvedValueOnce({ ok: false, state: "review", done: false })
    .mockResolvedValueOnce({ ok: true, state: "ok", done: false });
  const mood = renderHook(() => usePet(useSyncExternalStore(ws.subscribe, ws.getState, ws.getState)));
  const context = ctx();
  context.check = (id, answer, previous, item) => ws.actions.check("w1", id, answer, previous, item);
  render(<Steps block={{ ...steps, scaffold: [{ kind: "choice", prompt: "Choose", options: ["Wrong", "Right"] }] }} ctx={context} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Wrong" })); });
  expect(api.check).toHaveBeenLastCalledWith("s", { workspaceId: "w1", blockId: "s1", answer: "0", previous: [], item: 0 });
  expect(mood.result.current.mood).toBe("doubt");
  expect(mood.result.current.celebrateKey).toBe(0);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Right" })); });
  expect(mood.result.current.mood).toBe("happy");
  expect(mood.result.current.celebrateKey).toBe(1);
});

it("reset clears the workspace, saves an empty state after queued work, and reports it", async () => {
  vi.useFakeTimers();
  const { ws, api } = controller(saved);
  await vi.advanceTimersByTimeAsync(0);
  ws.actions.saveBlock("w1", "q1", { ...quizState, tries: 2, done: true });
  ws.actions.resetWorkspace("w1");
  const state = ws.getState();
  expect(state.tabs[0].state).toEqual({});
  expect(state.overrides.w1).toBeUndefined();
  expect(state.taskDone.w1).toBeUndefined();
  expect(state.resets.w1).toBe(1);
  await vi.advanceTimersByTimeAsync(0);
  // The pending debounced save is dropped; the empty state is the only write.
  expect(api.putWorkspaceState).toHaveBeenCalledExactlyOnceWith("w1", {});
  ws.actions.flushEvents();
  await vi.advanceTimersByTimeAsync(0);
  const message = (api.turn.mock.calls.at(-1) as unknown as [string, { content: string }])[1];
  expect(JSON.parse(message.content.slice("[workspace] ".length))).toEqual([expect.objectContaining({ type: "workspace_reset", workspace_id: "w1" })]);
});

it("reset does nothing while a check is in flight", async () => {
  vi.useFakeTimers();
  const { ws, api } = controller(saved);
  await vi.advanceTimersByTimeAsync(0);
  api.check.mockImplementationOnce(() => new Promise(() => {}));
  void ws.actions.check("w1", "s1", "2", [], 0);
  ws.actions.resetWorkspace("w1");
  expect(ws.getState().tabs[0].state).toEqual(saved);
  expect(ws.getState().resets.w1).toBeUndefined();
});

it("asks before resetting, and a new reset count remounts the doc fresh", async () => {
  const context = ctx();
  const onReset = vi.fn();
  const tab = { id: "w1", phase: "solve" as const, doc, state: { blocks: { s1: stepsState } }, restored: true };
  const view = render(<WorkspaceView tabs={[tab]} activeId="w1" onActive={vi.fn()} onReset={onReset} makeCtx={() => context} />);
  const reset = screen.getByRole("button", { name: copy.workspaceReset });
  fireEvent.click(reset);
  const cancel = screen.getByRole("button", { name: copy.workspaceResetCancel });
  await act(async () => {});
  expect(document.activeElement).toBe(cancel);
  fireEvent.keyDown(cancel, { key: "Escape" });
  expect(screen.queryByRole("group", { name: copy.workspaceResetConfirm })).toBeNull();
  expect(document.activeElement).toBe(reset);
  expect(onReset).not.toHaveBeenCalled();
  fireEvent.click(reset);
  const group = screen.getByRole("group", { name: copy.workspaceResetConfirm });
  fireEvent.click(within(group).getByRole("button", { name: copy.workspaceReset }));
  expect(onReset).toHaveBeenCalledExactlyOnceWith("w1");
  expect(screen.getByText("x = 2")).toBeTruthy();
  view.rerender(<WorkspaceView tabs={[{ ...tab, state: {} }]} activeId="w1" onActive={vi.fn()} onReset={onReset} resets={{ w1: 1 }} makeCtx={() => context} />);
  expect(screen.queryByText("x = 2")).toBeNull();
  expect(screen.queryByRole("group", { name: copy.workspaceResetConfirm })).toBeNull();
  // Fresh again, so there is nothing left to reset.
  expect((screen.getByRole("button", { name: copy.workspaceReset }) as HTMLButtonElement).disabled).toBe(true);
});

it("disables reset while busy", () => {
  render(<WorkspaceView tabs={[{ id: "w1", phase: "solve", doc, state: { blocks: { s1: stepsState } } }]} activeId="w1" onActive={vi.fn()} onReset={vi.fn()} resetDisabled makeCtx={() => ctx()} />);
  expect((screen.getByRole("button", { name: copy.workspaceReset }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("button", { name: copy.workspaceReset }).hasAttribute("data-busy")).toBe(true);
});

it("disables reset on an untouched workspace and enables it once there is work", () => {
  const button = () => screen.getByRole("button", { name: copy.workspaceReset }) as HTMLButtonElement;
  const view = render(<WorkspaceView tabs={[{ id: "w1", phase: "solve", doc }]} activeId="w1" onActive={vi.fn()} onReset={vi.fn()} makeCtx={() => ctx()} />);
  expect(button().disabled).toBe(true);
  expect(button().hasAttribute("data-busy")).toBe(false);
  view.rerender(<WorkspaceView tabs={[{ id: "w1", phase: "solve", doc }]} activeId="w1" onActive={vi.fn()} onReset={vi.fn()} taskDone={{ w1: ["s1"] }} makeCtx={() => ctx()} />);
  expect(button().disabled).toBe(false);
});
