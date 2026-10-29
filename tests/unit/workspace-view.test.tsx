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
) => <WorkspaceView tabs={Object.values(workspaces).map((w) => ({ ...w!, phase: w!.doc.phase }))} activeId={workspaces[phase]?.id ?? ""} onActive={onPhase} makeCtx={() => ctx} />;

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
  fireEvent.click(screen.getByRole("tab", { name: fixtures["solve-tangent.json"].title }));
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

test("a master-completed steps block stops asking for another line", () => {
  const doc = fixtures["solve-tangent.json"];
  const props = { tabs: [{ ...ws(doc), phase: doc.phase }], activeId: "solve", onActive: vi.fn(), makeCtx: () => ({ ...mk(), phase: "solve" as const }) };
  const { rerender } = render(<WorkspaceView {...props} />);
  expect(screen.getByRole("button", { name: copy.check })).toBeTruthy(); // still open

  rerender(<WorkspaceView {...props} taskDone={{ [doc.phase]: ["s1"] }} />);
  expect(screen.queryByRole("button", { name: copy.check })).toBeNull();
});


test("renders ordered same-phase tabs with distinct panels, keeps inputs mounted, and reveals the active tab", () => {
  const solve = { ...fixtures["solve-tangent.json"], title: "First solve" };
  const tabs = [
    { id: "S1", phase: "solve" as const, doc: solve },
    { id: "S2", phase: "solve" as const, doc: { ...solve, title: "Second solve" } },
    { id: "L1", phase: "learn" as const, doc: fixtures["learn-derivative.json"] },
  ];
  const onActive = vi.fn();
  const props = { tabs, onActive, makeCtx: (w: Workspace) => ({ ...mk(), workspaceId: w.id, phase: w.doc.phase }) };
  const { container, rerender } = render(<WorkspaceView {...props} activeId="S1" />);
  expect(screen.getAllByRole("tab").map((t) => t.id)).toEqual(["tab-S1", "tab-S2", "tab-L1"]);
  expect(screen.getAllByRole("tabpanel", { hidden: true }).map((p) => p.id)).toEqual(["panel-S1", "panel-S2", "panel-L1"]);
  const input = screen.getByRole("textbox", { name: copy.lineLabel(1) });
  fireEvent.change(input, { target: { value: "my first answer" } });
  const secondTab = screen.getByRole("tab", { name: "Second solve" });
  secondTab.focus();
  expect(document.activeElement).toBe(secondTab);
  fireEvent.click(secondTab);
  expect(onActive).toHaveBeenCalledWith("S2");
  const scrollIntoView = vi.fn();
  secondTab.scrollIntoView = scrollIntoView;
  rerender(<WorkspaceView {...props} activeId="S2" />);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  expect(container.querySelector("#panel-S1")?.hasAttribute("hidden")).toBe(true);
  expect(secondTab.getAttribute("aria-selected")).toBe("true");
  expect(secondTab.getAttribute("aria-controls")).toBe("panel-S2");
  expect(screen.getByRole("textbox", { name: copy.lineLabel(1) })).not.toBe(input);
  rerender(<WorkspaceView {...props} activeId="S1" />);
  expect(screen.getByRole("textbox", { name: copy.lineLabel(1) })).toBe(input);
  expect((input as HTMLInputElement).value).toBe("my first answer");
});
