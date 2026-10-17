import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderBlock } from "@/workspace/blocks";
import { BlockBoundary } from "@/workspace/BlockBoundary";
import type { Block, BlockCtx } from "@/workspace/types";

const jx = vi.hoisted(() => {
  const board = {
    create: vi.fn(),
    update: vi.fn(),
    setBoundingBox: vi.fn(),
    jc: { scope: { locals: {} as Record<string, number> }, snippet: vi.fn((expr: string) => (x: number) => (expr === "bad(" ? NaN : x)) },
  };
  return { board, initBoard: vi.fn(() => board), freeBoard: vi.fn() };
});
vi.mock("jsxgraph", () => ({ default: { JSXGraph: { initBoard: jx.initBoard, freeBoard: jx.freeBoard } } }));

const tokens: Record<string, string> = { "--text": "#111", "--muted": "#999", "--accent": "#7da2ff", "--hairline": "#222", "--panel": "#1a1e26" };
vi.spyOn(window, "getComputedStyle").mockImplementation(() => ({ getPropertyValue: (n: string) => ` ${tokens[n] ?? ""} ` }) as unknown as CSSStyleDeclaration);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ctx: BlockCtx = {
  workspaceId: "w",
  phase: "learn",
  report: vi.fn(),
  check: vi.fn(),
  overrides: {},
  hintCount: 0,
  onSolved: vi.fn(),
};
const graph = (over: Partial<Extract<Block, { type: "graph" }>> = {}): Block => ({
  type: "graph",
  id: "g1",
  fns: [
    { expr: "a*x^2", label: "y = ax^2" },
    { expr: "x", label: "y = x" },
  ],
  x: [-5, 5],
  y: [-2, 10],
  points: [{ x: 1, y: 1, label: "A" }],
  sliders: [{ name: "a", min: -3, max: 3, value: 1 }],
  ...over,
});

test("creates one functiongraph per fn", async () => {
  render(<>{renderBlock(graph(), ctx)}</>);
  await waitFor(() => expect(jx.board.create).toHaveBeenCalledWith("functiongraph", expect.anything(), expect.objectContaining({ name: "y = x" })));
  const kinds = jx.board.create.mock.calls.map((c) => c[0]);
  expect(kinds.filter((k) => k === "functiongraph")).toHaveLength(2);
  expect(kinds.filter((k) => k === "point")).toHaveLength(1);
  expect(jx.initBoard).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ boundingbox: [-5, 10, 5, -2] }));
});

test("sliders are labelled range inputs and update the board", async () => {
  render(<>{renderBlock(graph(), ctx)}</>);
  const s = screen.getByLabelText(/a/, { selector: "input" }) as HTMLInputElement;
  expect(s.type).toBe("range");
  await waitFor(() => expect(jx.board.create).toHaveBeenCalled());
  fireEvent.change(s, { target: { value: "2" } });
  expect(jx.board.jc.scope.locals.a).toBe(2);
  expect(jx.board.update).toHaveBeenCalled();
});

test("frees the board on unmount", async () => {
  const { unmount } = render(<>{renderBlock(graph(), ctx)}</>);
  await waitFor(() => expect(jx.initBoard).toHaveBeenCalled());
  unmount();
  expect(jx.freeBoard).toHaveBeenCalledWith(jx.board);
});

test("derives y from the sampled functions when absent", async () => {
  render(<>{renderBlock(graph({ y: undefined, sliders: undefined, fns: [{ expr: "x", label: "f" }] }), ctx)}</>);
  await waitFor(() => expect(jx.board.setBoundingBox).toHaveBeenCalledWith([-5, 6, 5, -6], true));
});

test("bad term throws to the boundary", async () => {
  jx.board.jc.snippet.mockImplementationOnce(() => {
    throw new Error("parse");
  });
  const report = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <BlockBoundary blockId="g1" report={report}>
      {renderBlock(graph(), ctx)}
    </BlockBoundary>,
  );
  await waitFor(() => expect(report).toHaveBeenCalledWith("render_error", expect.objectContaining({ block_id: "g1" })));
});

test("board colors come from the computed theme tokens", async () => {
  render(<>{renderBlock(graph(), ctx)}</>);
  await waitFor(() => expect(jx.board.create).toHaveBeenCalled());
  expect(jx.initBoard).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ defaultAxes: expect.objectContaining({ x: expect.objectContaining({ strokeColor: "#999" }) }) }));
  expect(jx.board.create).toHaveBeenCalledWith("functiongraph", expect.anything(), expect.objectContaining({ strokeColor: "#7da2ff", strokeWidth: 2 }));
  expect(jx.board.create).toHaveBeenCalledWith("point", expect.anything(), expect.objectContaining({ fillColor: "#7da2ff", label: { strokeColor: "#111" } }));
});

test("re-running the effect keeps the student's slider value", async () => {
  const { rerender } = render(<>{renderBlock(graph(), ctx)}</>);
  await waitFor(() => expect(jx.board.create).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText(/a/, { selector: "input" }), { target: { value: "2" } });
  jx.board.jc.scope.locals.a = 0;
  rerender(<>{renderBlock(graph(), ctx)}</>);
  await waitFor(() => expect(jx.initBoard).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(jx.board.jc.scope.locals.a).toBe(2));
});

test.each([
  ["create('point',[1,1])", "a"],
  ["use('x')", "a"],
  ["remove(x)", "a"],
  ["x", "__proto__"],
])("unsafe term %s / slider %s reaches render_error", async (expr, name) => {
  const report = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <BlockBoundary blockId="g1" report={report}>
      {renderBlock(graph({ fns: [{ expr, label: "f" }], sliders: [{ name, min: 0, max: 1, value: 0 }] }), ctx)}
    </BlockBoundary>,
  );
  await waitFor(() => expect(report).toHaveBeenCalledWith("render_error", expect.anything()));
});

test("slider step is range/100 and readout rounds to 2 decimals", () => {
  render(<>{renderBlock(graph({ sliders: [{ name: "a", min: 0, max: 1, value: 0.33333 }] }), ctx)}</>);
  expect((screen.getByLabelText(/a/, { selector: "input" }) as HTMLInputElement).step).toBe("0.01");
  expect(screen.getByText("0.33")).toBeTruthy();
});
