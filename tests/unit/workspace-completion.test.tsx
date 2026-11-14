import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PetAnchorProvider, usePetAnchor } from "@/components/pet/PetAnchor";
import { WorkspaceView } from "@/workspace/WorkspaceView";
import { copy } from "@/lib/copy";
import type { BlockCtx, StudentWork, Workspace } from "@/workspace/types";

afterEach(cleanup);
const workspace: Workspace = { id: "w", doc: { version: 1, phase: "solve", title: "Two parts", sources: [], blocks: [
  { type: "problem", id: "p", md: "Gia tốc và lực" },
  { type: "steps", id: "part1", problem_id: "p", input: "math" },
  { type: "steps", id: "part2", problem_id: "p", input: "text" },
] } };
const saved = (done: boolean) => ({ type: "steps" as const, entries: [], done, free: false });
function AnchorProbe() {
  const { anchor } = usePetAnchor();
  return <output data-testid="anchor">{anchor?.hasAttribute("data-pet-done") ? "done" : anchor?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId ?? "none"}</output>;
}
function setup(state?: StudentWork, taskDone: string[] = []) {
  const w = { ...workspace, ...(state && { state, restored: true }) };
  const ctx: BlockCtx = {
    workspaceId: "w", phase: "solve", report: vi.fn(),
    check: vi.fn(async () => ({ ok: true, state: "ok" as const, done: true })),
    overrides: {}, hintCount: 0, onSolved: vi.fn(), help: null,
  };
  const view = (done: string[]) => <PetAnchorProvider><WorkspaceView tabs={[{ ...w, phase: "solve" }]} activeId="w" onActive={vi.fn()} makeCtx={() => ctx} taskDone={{ w: done }} /><AnchorProbe /></PetAnchorProvider>;
  const result = render(view(taskDone));
  return { ctx, container: result.container, update: (done: string[]) => result.rerender(view(done)) };
}
const completions = (ctx: BlockCtx) => vi.mocked(ctx.report).mock.calls.filter(([type]) => type === "task_completed");
async function complete(index = 0) {
  const previous = screen.queryAllByLabelText(copy.stateOk).length;
  fireEvent.change(screen.getAllByRole("textbox")[index], { target: { value: "2" } });
  fireEvent.click(screen.getAllByRole("button", { name: copy.check })[index]);
  await waitFor(() => expect(screen.getAllByLabelText(copy.stateOk)).toHaveLength(previous + 1));
}

test("completing part 1 leaves part 2 editable and reports completion only after both", async () => {
  const { ctx } = setup();
  await complete();
  expect(screen.queryByText(copy.doneLabel)).toBeNull();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(completions(ctx)).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: copy.hint }));
  expect(ctx.report).toHaveBeenCalledWith("help_requested", { block_id: "part2", level: 1 });
  await complete();
  await screen.findByText(copy.doneLabel);
  expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  expect(completions(ctx)).toEqual([["task_completed", { similar: false, helped: true, max_hint: 1 }]]);
});

test("AI completion affects only its block and reports once after all blocks", () => {
  const { ctx, update } = setup();
  update(["part1"]);
  expect(screen.queryByText(copy.doneLabel)).toBeNull();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(completions(ctx)).toHaveLength(0);
  update(["part1", "part2"]);
  expect(screen.getByText(copy.doneLabel)).toBeTruthy();
  update(["part1", "part2", "part2"]);
  expect(completions(ctx)).toEqual([["task_completed", { similar: false, helped: false, max_hint: 0, via: "master" }]]);
});

test.each(["checks", "master"])("restoring partial %s completion keeps the remaining part open", async source => {
  const { ctx } = setup(source === "checks"
    ? { blocks: { part1: saved(true), part2: saved(false) } }
    : { taskDone: ["part1"] });
  expect(screen.queryByText(copy.doneLabel)).toBeNull();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(completions(ctx)).toHaveLength(0);
  await complete();
  await screen.findByText(copy.doneLabel);
  expect(completions(ctx)).toHaveLength(1);
});

test("restoring a fully completed workspace does not report completion again", () => {
  const { ctx } = setup({ blocks: { part1: saved(true) }, taskDone: ["part2"] });
  expect(screen.getByText(copy.doneLabel)).toBeTruthy();
  expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  expect(completions(ctx)).toHaveLength(0);
});

test("a student finishing after an AI-completed part remains a student completion", async () => {
  const { ctx } = setup(undefined, ["part1"]);
  await complete();
  await screen.findByText(copy.doneLabel);
  expect(completions(ctx)).toEqual([["task_completed", { similar: false, helped: false, max_hint: 0 }]]);
});

test("AI finishing after a student-completed part remains a master completion", async () => {
  const { ctx, update } = setup();
  await complete();
  update(["part2"]);
  expect(screen.getByText(copy.doneLabel)).toBeTruthy();
  expect(completions(ctx)).toEqual([["task_completed", { similar: false, helped: false, max_hint: 0, via: "master" }]]);
});

test("stale saved blocks cannot mark current tasks complete", () => {
  const { ctx } = setup({ blocks: { removed: saved(true) }, taskDone: ["removed"] });
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
  expect(screen.queryByText(copy.doneLabel)).toBeNull();
  expect(completions(ctx)).toHaveLength(0);
});

test("the done anchor takes over only after every steps block finishes", async () => {
  const { container } = setup();
  expect(screen.getByTestId("anchor").textContent).toBe("part1");
  expect(container.querySelector("[data-pet-done]")).toBeNull();
  await complete();
  expect(screen.getByTestId("anchor").textContent).not.toBe("done");
  expect(container.querySelector("[data-pet-done]")).toBeNull();
  await complete();
  await screen.findByText(copy.doneLabel);
  expect(screen.getByTestId("anchor").textContent).toBe("done");
  expect(container.querySelectorAll("[data-pet-anchor]")).toHaveLength(1);
  const done = container.querySelector("[data-pet-done]")!;
  expect(done.previousElementSibling).toBe(screen.getByText(copy.doneLabel).closest('[role="status"]'));
  expect(done.querySelector("[data-pet-slot]")).toBeTruthy();
  expect(done.querySelector("[data-pet-spoken-slot]")).toBeTruthy();
});

test.each(["solve", "practice"] as const)("a restored finished %s anchor releases while hidden and reclaims when shown", (phase) => {
  const finished = { ...workspace, id: "finished", doc: { ...workspace.doc, phase }, restored: true, state: { taskDone: ["part1", "part2"] } };
  const learn = { ...workspace, id: "learn", doc: { ...workspace.doc, phase: "learn" as const } };
  const view = (activeId: string) => <PetAnchorProvider>
    <WorkspaceView tabs={[{ ...learn, phase: "learn" }, { ...finished, phase }]} activeId={activeId} onActive={vi.fn()}
      makeCtx={(w) => ({ workspaceId: w.id, phase: w.doc.phase, report: vi.fn(), check: vi.fn(), overrides: {}, hintCount: 0, onSolved: vi.fn(), help: null })} />
    <AnchorProbe />
  </PetAnchorProvider>;
  const { container, rerender } = render(view("learn"));
  expect(screen.getByTestId("anchor").textContent).toBe("part1");
  expect(container.querySelector('[data-phase="learn"] [data-pet-inline]')).toBeNull();
  rerender(view("finished"));
  expect(screen.getByTestId("anchor").textContent).toBe("done");
  rerender(view("learn"));
  expect(screen.getByTestId("anchor").textContent).toBe("part1");
  rerender(view("finished"));
  expect(screen.getByTestId("anchor").textContent).toBe("done");
});

const progressWorkspace = (id: string, phase: "solve" | "practice" | "learn" = "solve", done = true): Workspace & { phase: typeof phase } => ({
  id, phase, restored: true,
  doc: { version: 1, phase, title: id, sources: [], blocks: [
    { type: "problem", id: "p", md: "Tính vận tốc" },
    { type: "steps", id: "s", problem_id: "p", input: "math", roadmap: "motion_current", scaffold: [
      { kind: "choice", prompt: "First", options: ["A", "B"], stage: 0 },
      { kind: "choice", prompt: "Second", options: ["C", "D"], stage: 1 },
    ] },
  ] },
  state: { blocks: { s: { type: "steps", done, free: false, entries: [
    { text: "A", item: 0, state: "ok", tries: 1, hint: 0 },
    { text: "C", item: 1, state: "review" },
  ] } } },
});
const progressCtx = (w: Workspace): BlockCtx => ({
  workspaceId: w.id, phase: w.doc.phase, check: vi.fn(), report: vi.fn(), onSolved: vi.fn(), overrides: {}, hintCount: 0, help: null,
});

test("completion rows use saved entries and live overrides even without a takeaway", () => {
  const w = progressWorkspace("w");
  const makeCtx = (w: Workspace) => ({ ...progressCtx(w), overrides: { s: { 1: "review" as const, 2: "ok" as const } } });
  render(<PetAnchorProvider><WorkspaceView tabs={[w]} activeId="w" onActive={vi.fn()} makeCtx={makeCtx} /></PetAnchorProvider>);
  expect(screen.getByText(copy.stageTodo)).toBeTruthy();
  expect(screen.getByText(copy.stageUnknown)).toBeTruthy();
  expect(screen.queryByText(copy.stageFirst)).toBeNull();
});

test.each(["learn", "free", "no-roadmap"])("%s completion has no stage rows", (mode) => {
  const w = progressWorkspace("w", mode === "learn" ? "learn" : "solve");
  const block = w.doc.blocks.find(b => b.type === "steps")!;
  if (mode === "no-roadmap" && block.type === "steps") delete block.roadmap;
  const saved = w.state?.blocks?.s;
  if (mode === "free" && saved?.type === "steps") saved.free = true;
  const { container } = render(<PetAnchorProvider><WorkspaceView tabs={[w]} activeId="w" onActive={vi.fn()} makeCtx={progressCtx} /></PetAnchorProvider>);
  const card = container.querySelector('[role="status"]')!;
  expect(card).toBeTruthy();
  expect(card.querySelector("ul")).toBeNull();
});

test("only the last non-learn tab receives the offer, including when a learn tab follows it", () => {
  const tabs = [progressWorkspace("old"), progressWorkspace("latest", "practice"), progressWorkspace("learn", "learn")];
  const onPick = vi.fn();
  const offer = { opts: ["Next lesson", "Similar problem"], onPick };
  const view = (offerProp: typeof offer | null) => <PetAnchorProvider><WorkspaceView tabs={tabs} activeId="latest" onActive={vi.fn()} makeCtx={progressCtx} offer={offerProp} /></PetAnchorProvider>;
  const { container, rerender } = render(view(offer));
  expect(container.querySelectorAll('#panel-old [role="status"] button')).toHaveLength(0);
  expect(container.querySelectorAll('#panel-latest [role="status"] button')).toHaveLength(2);
  expect(container.querySelectorAll('#panel-learn [role="status"] button')).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Next lesson" }));
  expect(onPick).toHaveBeenCalledWith("Next lesson");
  rerender(view(null));
  expect(container.querySelectorAll('[role="status"] button')).toHaveLength(0);
});

test("a later unfinished non-learn tab keeps the offer off earlier completed cards", () => {
  const tabs = [progressWorkspace("old"), progressWorkspace("unfinished", "practice", false)];
  const { container } = render(<PetAnchorProvider><WorkspaceView tabs={tabs} activeId="old" onActive={vi.fn()} makeCtx={progressCtx} offer={{ opts: ["Next", "Similar"], onPick: vi.fn() }} /></PetAnchorProvider>);
  expect(container.querySelectorAll('[role="status"] button')).toHaveLength(0);
});
