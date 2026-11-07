import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Page from "@/app/page";
import { BuildingSkeleton } from "@/components/work/BuildingSkeleton";
import { PetAnchorProvider, usePetAnchor } from "@/components/pet/PetAnchor";
import { useWorkspace } from "@/hooks/useWorkspace";
import * as api from "@/lib/api";
import type { Preview, TurnEvent } from "@/lib/api";
import { copyFor, setLocale } from "@/lib/copy";
import { Steps } from "@/workspace/blocks/Steps";
import type { Block, BlockCtx, WorkspaceDoc } from "@/workspace/types";

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  createGuest: vi.fn(), currentSession: vi.fn(), createSession: vi.fn(), endSession: vi.fn(),
  turn: vi.fn(), check: vi.fn(), putWorkspaceState: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

const en = copyFor("en");
const viCopy = copyFor("vi");
const problem = { type: "problem" as const, id: "p", md: "Find the derivative of x squared." };
const first = { kind: "choice" as const, prompt: "Where should we start?", options: ["Differentiate", "Integrate"] };
const steps: Extract<Block, { type: "steps" }> = {
  type: "steps", id: "s", problem_id: "p", input: "math", scaffold: [first, { kind: "blank", template: "x = ___" }],
};
const preview: Preview = { phase: "solve", title: null, blocks: [problem, { ...steps, pending: true, problem_id: null, input: null, roadmap: null }] };
const partial: TurnEvent = { event: "workspace_partial", ...preview };
const finalDoc = (block = steps): WorkspaceDoc => ({ version: 1, phase: "solve", title: "Derivative", sources: [], blocks: [problem, block] });
const finalEvent = (block = steps): TurnEvent => ({ event: "workspace", workspaceId: "w", phase: "solve", doc: finalDoc(block) });
const DONE = { turnId: "t", stopReason: "end_turn" };

beforeEach(() => {
  vi.resetAllMocks();
  setLocale("vi");
  vi.mocked(api.createGuest).mockResolvedValue({ guestId: "g", created: true });
  vi.mocked(api.currentSession).mockResolvedValue(null);
  vi.mocked(api.createSession).mockResolvedValue({ sessionId: "session" });
  vi.mocked(api.endSession).mockResolvedValue(undefined);
  vi.mocked(api.putWorkspaceState).mockResolvedValue(undefined);
  vi.mocked(api.check).mockResolvedValue({ ok: true, state: "ok", done: false });
  vi.mocked(api.turn).mockResolvedValue(DONE);
});
afterEach(() => { cleanup(); setLocale("vi"); });

it("renders real solve blocks, queues item zero and keeps its busy state as more items arrive", () => {
  const queue = vi.fn();
  const { container, rerender } = render(<BuildingSkeleton preview={preview} onQueue={queue} />);
  expect(screen.getByText(problem.md)).toBeTruthy();
  expect(screen.getByText(first.prompt)).toBeTruthy();
  expect(screen.getByText(en.composingNext)).toBeTruthy();
  expect(screen.queryByText("x = ___")).toBeNull();
  expect(container.querySelector('[class*="entry"]')).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Differentiate/ }));
  expect(queue).toHaveBeenCalledWith({ blockId: "s", item: 0, input: "choice", prompt: first.prompt, optionText: "Differentiate" });
  expect(screen.getByText(en.checkQueued)).toBeTruthy();
  expect((screen.getByRole("button", { name: /Integrate/ }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<BuildingSkeleton preview={{ ...preview, blocks: [problem, { ...steps, pending: false }] }} onQueue={queue} />);
  expect(screen.queryByText(en.composingNext)).toBeNull();
  expect(screen.getByText(en.checkQueued)).toBeTruthy();
});

it("remounts a rewritten first item and allows a new answer", () => {
  const { rerender } = render(<BuildingSkeleton preview={preview} />);
  fireEvent.click(screen.getByRole("button", { name: /Differentiate/ }));
  rerender(<BuildingSkeleton preview={{ ...preview, blocks: [problem, { ...steps, pending: true, scaffold: [{ ...first, prompt: "New prompt?" }] }] }} />);
  expect(screen.getByText("New prompt?")).toBeTruthy();
  expect(screen.queryByText(en.checkQueued)).toBeNull();
  expect((screen.getByRole("button", { name: /Differentiate/ }) as HTMLButtonElement).disabled).toBe(false);
});

it("supports blank preview answers and uses problem language for chrome", () => {
  const queue = vi.fn();
  render(<BuildingSkeleton preview={{ phase: "practice", title: null, blocks: [{ ...problem, md: "Tính đạo hàm" }, { ...steps, pending: true, scaffold: [{ kind: "blank", template: "$x = ___$" }] }] }} onQueue={queue} />);
  const input = screen.getByRole("textbox", { name: viCopy.blankLabel(1) });
  fireEvent.change(input, { target: { value: "2" } });
  fireEvent.submit(input.closest("form")!);
  expect(queue).toHaveBeenCalledWith({ blockId: "s", item: 0, input: "blank", template: "$x = ___$", value: "2" });
  expect((input as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText(viCopy.checkQueued)).toBeTruthy();
  expect(screen.getByText(viCopy.composingNext)).toBeTruthy();
});

it("leaves learn text and stub previews working", () => {
  const { container } = render(<BuildingSkeleton variant="learn" preview={{ phase: "learn", title: "Lesson", blocks: [{ type: "text", id: "t", md: "Lesson text" }, { type: "stub", id: "figure" }] }} />);
  expect(screen.getByRole("heading", { name: "Lesson" })).toBeTruthy();
  expect(screen.getByText("Lesson text")).toBeTruthy();
  expect(container.querySelector('[class*="box"]')).toBeTruthy();
});

it("does not take focus or a pet anchor, even with a provider present", () => {
  const Anchor = () => <output data-testid="anchor">{usePetAnchor().anchor ? "claimed" : "none"}</output>;
  const focus = document.createElement("button");
  document.body.append(focus);
  focus.focus();
  render(<PetAnchorProvider><BuildingSkeleton preview={preview} /><Anchor /></PetAnchorProvider>);
  expect(screen.getByTestId("anchor").textContent).toBe("none");
  expect(document.activeElement).toBe(focus);
  focus.remove();
});

function stream(initial: TurnEvent = partial) {
  let emit!: (event: TurnEvent) => void;
  let finish!: () => void;
  vi.mocked(api.turn).mockImplementationOnce(async (_s, _m, _delta, onEvent) => {
    emit = onEvent!;
    onEvent!(initial);
    await new Promise<void>((resolve) => { finish = resolve; });
    return DONE;
  });
  return { emit: (event: TurnEvent) => emit(event), finish: () => finish() };
}
async function startPage() {
  render(<StrictMode><Page /></StrictMode>);
  const composer = screen.getByRole("textbox", { name: viCopy.inputLabel });
  fireEvent.change(composer, { target: { value: "derive" } });
  fireEvent.click(screen.getByRole("button", { name: viCopy.send }));
  await screen.findByText(first.prompt);
  fireEvent.click(screen.getByRole("button", { name: /Differentiate/ }));
  expect(screen.getByText(en.checkQueued)).toBeTruthy();
}

it("replays once through the final Steps with the shuffled option index under StrictMode", async () => {
  const turn = stream();
  await startPage();
  expect(api.check).not.toHaveBeenCalled();
  await act(async () => { turn.emit(finalEvent({ ...steps, scaffold: [{ ...first, options: ["Integrate", "Differentiate"] }, { kind: "blank", template: "x = ___" }] })); turn.finish(); });
  await waitFor(() => expect(api.check).toHaveBeenCalledTimes(1));
  expect(api.check).toHaveBeenCalledWith("session", { workspaceId: "w", blockId: "s", answer: "1", previous: [], item: 0 });
  expect(screen.getByLabelText(en.stateOk)).toBeTruthy();
  expect(screen.getByRole("textbox", { name: en.blankLabel(2) })).toBeTruthy();
});

it("drops a final first item that changed and leaves its options answerable", async () => {
  const turn = stream();
  await startPage();
  await act(async () => { turn.emit(finalEvent({ ...steps, scaffold: [{ ...first, prompt: "A different question?" }] })); turn.finish(); });
  expect(api.check).not.toHaveBeenCalled();
  expect(screen.getByText("A different question?")).toBeTruthy();
  expect(screen.queryByText(en.checkQueued)).toBeNull();
  expect((screen.getByRole("button", { name: /Differentiate/ }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByLabelText(en.stateOk)).toBeNull();
});

async function startHook() {
  const turn = stream();
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => { result.current.setInput("derive"); void result.current.submit(); });
  await waitFor(() => expect(result.current.preview).not.toBeNull());
  const skeleton = render(<BuildingSkeleton preview={result.current.preview} onQueue={result.current.queueAnswer} />);
  fireEvent.click(screen.getByRole("button", { name: /Differentiate/ }));
  expect(result.current.queuedAnswer).toEqual({ blockId: "s", item: 0, input: "choice", prompt: first.prompt, optionText: "Differentiate" });
  return { turn, result, skeleton };
}

it.each(["failed", "rewrite", "reset", "missing", "phase"])("clears the store queue on %s", async (reason) => {
  const { turn, result } = await startHook();
  act(() => {
    if (reason === "failed") turn.emit({ event: "status", stage: "failed" });
    if (reason === "rewrite") turn.emit({ ...preview, event: "workspace_partial", blocks: [problem, { ...steps, pending: true, scaffold: [{ ...first, prompt: "Rewritten?" }] }] });
    if (reason === "reset") result.current.newProblem();
    if (reason === "missing") turn.emit({ ...finalEvent(), doc: { ...finalDoc(), blocks: [problem] } } as TurnEvent);
    if (reason === "phase") turn.emit({ event: "workspace", workspaceId: "L", phase: "learn", doc: { ...finalDoc(), phase: "learn" } });
  });
  expect(result.current.queuedAnswer).toBeNull();
  expect(result.current.tabs.every((w) => !w.queued)).toBe(true);
  await act(async () => turn.finish());
  expect(api.check).not.toHaveBeenCalled();
});

it("does not replay onto restored Steps state", () => {
  const check = vi.fn();
  const clearQueued = vi.fn();
  const ctx: BlockCtx = {
    phase: "solve", workspaceId: "w", check, clearQueued, report: vi.fn(), overrides: {}, hintCount: 0, onSolved: vi.fn(), help: null,
    state: { blocks: { s: { type: "steps", entries: [], done: false, free: false } } },
    queued: { blockId: "s", answer: "0", text: "Differentiate", input: "choice", item: 0 },
  };
  render(<Steps block={steps} ctx={ctx} />);
  expect(check).not.toHaveBeenCalled();
  expect(clearQueued).not.toHaveBeenCalled();
});

it("keeps copy key parity", () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(viCopy).sort());
});

it("keeps incomplete steps grey until item zero is finished", () => {
  const { container } = render(<BuildingSkeleton preview={{ phase: "practice", title: null, blocks: [problem, { type: "steps", id: "s", pending: true }] }} />);
  expect(screen.getByText(problem.md)).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(container.querySelectorAll('[class*="entry"]').length).toBe(3);
});

it("does not resurrect a queue when a retry later returns the original item", async () => {
  const { turn, result } = await startHook();
  act(() => turn.emit({ ...preview, event: "workspace_partial", blocks: [problem, { ...steps, pending: true, scaffold: [{ ...first, prompt: "Retry?" }] }] }));
  expect(result.current.queuedAnswer).toBeNull();
  await act(async () => { turn.emit(partial); turn.emit(finalEvent()); turn.finish(); });
  expect(result.current.tabs[0].queued).toBeUndefined();
  expect(api.check).not.toHaveBeenCalled();
});

it("replays a blank through the page, saves it and reports the exact original template text", async () => {
  const blank = { ...steps, scaffold: [{ kind: "blank" as const, template: "$x = ___$" }] };
  const turn = stream({ event: "workspace_partial", phase: "solve", title: null, blocks: [problem, { ...blank, pending: true }] });
  render(<StrictMode><Page /></StrictMode>);
  fireEvent.change(screen.getByRole("textbox", { name: viCopy.inputLabel }), { target: { value: "derive" } });
  fireEvent.click(screen.getByRole("button", { name: viCopy.send }));
  const input = await screen.findByRole("textbox", { name: en.blankLabel(1) });
  fireEvent.change(input, { target: { value: "2" } });
  fireEvent.submit(input.closest("form")!);
  expect(api.check).not.toHaveBeenCalled();
  await act(async () => { turn.emit(finalEvent(blank)); turn.finish(); });
  await waitFor(() => expect(api.check).toHaveBeenCalledTimes(1));
  expect(api.check).toHaveBeenCalledWith("session", { workspaceId: "w", blockId: "s", answer: "2", previous: [], item: 0 });
  await waitFor(() => expect(api.putWorkspaceState).toHaveBeenCalledWith("w", expect.objectContaining({ blocks: { s: expect.objectContaining({ entries: [{ answer: "2", text: "$x = 2$", state: "ok", item: 0 }] }) } })));
  // line_checked is flushed by the normal gesture/event timer alongside the state save.
  const message = vi.mocked(api.turn).mock.calls.slice(1).map((call) => String(call[1].content)).join("\n");
  expect(message).toContain('"type":"line_checked"');
  expect(message).toContain('"text":"$x = 2$"');
  expect(message).toContain('"input":"blank"');
});
