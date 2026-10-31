import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { WorkspaceView } from "@/workspace/WorkspaceView";
import { copy } from "@/lib/copy";
import type { BlockCtx, StudentWork, Workspace } from "@/workspace/types";

afterEach(cleanup);
const workspace: Workspace = { id: "w", doc: { version: 1, phase: "solve", title: "Two parts", sources: [], blocks: [
  { type: "problem", id: "p", md: "Acceleration AND force partner" },
  { type: "steps", id: "part1", problem_id: "p", input: "math" },
  { type: "steps", id: "part2", problem_id: "p", input: "text" },
] } };
const saved = (done: boolean) => ({ type: "steps" as const, entries: [], done, free: false });
function setup(state?: StudentWork, taskDone: string[] = []) {
  const w = { ...workspace, ...(state && { state, restored: true }) };
  const ctx: BlockCtx = {
    workspaceId: "w", phase: "solve", report: vi.fn(),
    check: vi.fn(async () => ({ ok: true, state: "ok" as const, done: true })),
    overrides: {}, hintCount: 0, onSolved: vi.fn(), help: null,
  };
  const view = (done: string[]) => <WorkspaceView tabs={[{ ...w, phase: "solve" }]} activeId="w" onActive={vi.fn()} makeCtx={() => ctx} taskDone={{ w: done }} />;
  const result = render(view(taskDone));
  return { ctx, update: (done: string[]) => result.rerender(view(done)) };
}
const completions = (ctx: BlockCtx) => vi.mocked(ctx.report).mock.calls.filter(([type]) => type === "task_completed");
async function complete(index = 0) {
  const previous = screen.queryAllByText(copy.stateOk).length;
  fireEvent.change(screen.getAllByRole("textbox")[index], { target: { value: "2" } });
  fireEvent.click(screen.getAllByRole("button", { name: copy.check })[index]);
  await waitFor(() => expect(screen.getAllByText(copy.stateOk)).toHaveLength(previous + 1));
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
