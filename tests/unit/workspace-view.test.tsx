import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { copy } from "@/lib/copy";
import { fixtures } from "@/workspace/fixtures";
import type { BlockCtx, Phase, Workspace, WorkspaceDoc } from "@/workspace/types";
import { WorkspaceView } from "@/workspace/WorkspaceView";

afterEach(cleanup);

const mk = (): BlockCtx => ({
  workspaceId: "w",
  phase: "learn",
  report: vi.fn(),
  check: vi.fn(),
  overrides: {},
  hintCount: 0,
  onSolved: vi.fn(),
  help: null,
});
const ws = (doc: WorkspaceDoc): Workspace => ({ id: doc.phase, doc });
const view = (
  workspaces: Partial<Record<Phase, Workspace>>,
  phase: Phase,
  onPhase = vi.fn(),
  ctx = mk(),
) => <WorkspaceView workspaces={workspaces} phase={phase} onPhase={onPhase} makeCtx={() => ctx} />;

test("renders every content fixture", () => {
  for (const name of ["heading", "text", "math", "image", "callout", "example", "quiz", "learn-derivative", "learn-history"]) {
    const doc = fixtures[`${name}.json`];
    const { container, unmount } = render(view({ [doc.phase]: ws(doc) }, doc.phase));
    expect(container.querySelector("h1")?.textContent).toBe(doc.title);
    expect(container.textContent).not.toContain(copy.blockFailed);
    unmount();
  }
  const d = fixtures["learn-history.json"];
  render(view({ learn: ws(d) }, "learn"));
  expect(d.sources.length).toBeGreaterThan(0);
  expect(screen.getByText(copy.sources)).toBeTruthy();
});

test("phase switch shows only present phases and calls onPhase", () => {
  const onPhase = vi.fn();
  render(view({ learn: ws(fixtures["learn-derivative.json"]), solve: ws(fixtures["solve-tangent.json"]) }, "learn", onPhase));
  expect(screen.getByRole("tablist")).toBeTruthy();
  expect(screen.getAllByRole("tab")).toHaveLength(2);
  expect(screen.queryByRole("tab", { name: copy.phasePractice })).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: copy.phaseSolve }));
  expect(onPhase).toHaveBeenCalledWith("solve");
});

test("hidden phase stays mounted", () => {
  const w = { learn: ws(fixtures["learn-derivative.json"]), solve: ws({ ...fixtures["quiz.json"], phase: "solve", title: "S" }) };
  const ctx = mk();
  const { rerender, container } = render(view(w, "solve", vi.fn(), ctx));
  const input = () => container.querySelector("input") as HTMLInputElement | null;
  const q: WorkspaceDoc = { ...fixtures["quiz.json"], phase: "learn", blocks: [{ type: "quiz", id: "q9", question_md: "x", answer: "number", explanation_md: "e" }] };
  rerender(view({ learn: ws(q), solve: w.solve }, "learn", vi.fn(), ctx));
  fireEvent.change(input()!, { target: { value: "42" } });
  rerender(view({ learn: ws(q), solve: w.solve }, "solve", vi.fn(), ctx));
  const el = input()!;
  expect(el.value).toBe("42");
  expect(el.closest("[hidden]")).not.toBeNull();
});

test("boundary isolates a throwing block", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const bad = { type: "text", id: "bad", get md(): string { throw new Error("boom"); } } as unknown as WorkspaceDoc["blocks"][number];
  const doc: WorkspaceDoc = {
    ...fixtures["text.json"],
    blocks: [{ type: "heading", id: "h1", text: "Trước", level: 2 }, bad, { type: "heading", id: "h2", text: "Sau", level: 2 }],
  };
  const ctx = mk();
  render(view({ learn: ws(doc) }, "learn", vi.fn(), ctx));
  expect(screen.getByText("Trước")).toBeTruthy();
  expect(screen.getByText("Sau")).toBeTruthy();
  expect(screen.getByText(copy.blockFailed)).toBeTruthy();
  expect(ctx.report).toHaveBeenCalledTimes(1);
  expect(ctx.report).toHaveBeenCalledWith("render_error", { block_id: "bad", message: "boom" });
  spy.mockRestore();
});

test("a single phase renders no phase switch", () => {
  render(view({ learn: ws(fixtures["learn-derivative.json"]) }, "learn"));
  expect(screen.queryByRole("tablist")).toBeNull();
});

test("a single-phase doc is not a tab panel; with a PhaseSwitch each panel is labelled by its tab", () => {
  const solve = ws(fixtures["solve-tangent.json"]);
  const { container, unmount } = render(view({ solve }, "solve"));
  const panel = container.querySelector("#panel-solve")!;
  expect(panel.getAttribute("role")).toBeNull();
  expect(panel.getAttribute("aria-labelledby")).toBeNull();
  unmount();

  render(view({ learn: ws(fixtures["learn-derivative.json"]), solve }, "solve"));
  const panels = screen.getAllByRole("tabpanel", { hidden: true });
  expect(panels.map((p) => p.getAttribute("aria-labelledby"))).toEqual(["tab-learn", "tab-solve"]);
});

const openQuiz = (id: string) => ({ type: "quiz", id, question_md: id, answer: "open", explanation_md: "e" }) as const;

test("a learn doc reports learn_completed once, after its last quiz is answered", () => {
  const doc: WorkspaceDoc = { ...fixtures["quiz.json"], phase: "learn", blocks: [openQuiz("q1"), openQuiz("q2")] };
  const ctx = mk();
  const { container } = render(view({ learn: ws(doc) }, "learn", vi.fn(), ctx));
  const inputs = container.querySelectorAll("input");
  const buttons = screen.getAllByRole("button", { name: copy.answer });
  const types = () => (ctx.report as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);

  fireEvent.change(inputs[0], { target: { value: "a" } });
  fireEvent.click(buttons[0]);
  expect(types()).toEqual(["quiz_answered"]);

  fireEvent.change(inputs[1], { target: { value: "b" } });
  fireEvent.click(buttons[1]);
  expect(types()).toEqual(["quiz_answered", "quiz_answered", "learn_completed"]);
});

test("a quiz in a solve doc never reports learn_completed", () => {
  const doc: WorkspaceDoc = {
    ...fixtures["quiz.json"],
    phase: "solve",
    blocks: [{ type: "problem", id: "p1", md: "x" }, openQuiz("q1")],
  };
  const ctx = mk();
  const { container } = render(view({ solve: ws(doc) }, "solve", vi.fn(), ctx));
  fireEvent.change(container.querySelector("input")!, { target: { value: "a" } });
  fireEvent.click(screen.getByRole("button", { name: copy.answer }));
  expect((ctx.report as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(["quiz_answered"]);
});
