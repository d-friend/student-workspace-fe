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

// ---- geometry ----
type Handler = (e?: unknown) => void;
const geo = (over: Partial<Extract<Block, { type: "geometry" }>> = {}): Block => ({
  type: "geometry",
  id: "geo1",
  points: [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 4, y: 0 },
    { id: "C", x: 0, y: 3 },
  ],
  segments: [["A", "B"]],
  circles: [{ center: "A", through: "C" }],
  tools: ["point", "midpoint", "segment", "perpendicular"],
  ...over,
});
// Every created element records its handlers so tests can "click" it.
const els: { kind: string; args: unknown[]; attrs: Record<string, unknown>; h: Record<string, Handler> }[] = [];
function setupGeo() {
  els.length = 0;
  jx.board.create.mockImplementation((kind: string, args: unknown[], attrs: Record<string, unknown> = {}) => {
    const el = { kind, args, attrs, h: {} as Record<string, Handler>, on: (ev: string, f: Handler) => void (el.h[ev] = f) };
    els.push(el);
    return el;
  });
  Object.assign(jx.board, {
    on: vi.fn((ev: string, f: Handler) => void (boardH[ev] = f)),
    getAllObjectsUnderMouse: vi.fn(() => []),
    getUsrCoordsOfMouse: vi.fn(() => [1.5, 2.5]),
  });
}
const boardH: Record<string, Handler> = {};
const pt = (name: string) => els.find((e) => e.kind === "point" && e.attrs.name === name)!;
const ctxR = () => ({ ...ctx, report: vi.fn() }) as BlockCtx;

test("draws fixed figure", async () => {
  setupGeo();
  render(<>{renderBlock(geo(), ctx)}</>);
  await waitFor(() => expect(els.filter((e) => e.kind === "point")).toHaveLength(3));
  expect(pt("B").attrs).toMatchObject({ fixed: true, fillColor: "#7da2ff" });
  expect(els.filter((e) => e.kind === "segment")).toHaveLength(1);
  expect(els.filter((e) => e.kind === "circle")).toHaveLength(1);
});

test("toolbar shows only listed tools", () => {
  setupGeo();
  render(<>{renderBlock(geo({ tools: ["midpoint", "angle"] }), ctx)}</>);
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Trung điểm", "Góc"]);
  fireEvent.click(screen.getByRole("button", { name: "Góc" }));
  expect(screen.getByRole("button", { name: "Góc" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("status").textContent).toBe("Chọn 3 điểm");
  fireEvent.keyDown(screen.getByRole("button", { name: "Góc" }), { key: "Escape" });
  expect(screen.getByRole("button", { name: "Góc" }).getAttribute("aria-pressed")).toBe("false");
});

test("midpoint construction reports deps", async () => {
  setupGeo();
  const c = ctxR();
  render(<>{renderBlock(geo(), c)}</>);
  await waitFor(() => expect(els.length).toBeGreaterThan(3));
  fireEvent.click(screen.getByRole("button", { name: "Trung điểm" }));
  pt("A").h.down();
  expect(c.report).not.toHaveBeenCalled();
  pt("B").h.down();
  expect(c.report).toHaveBeenCalledWith("construction_made", { block_id: "geo1", type: "midpoint", deps: ["A", "B"] });
  expect(els.some((e) => e.kind === "midpoint")).toBe(true);
});

test("new point gets next letter", async () => {
  setupGeo();
  const c = ctxR();
  render(<>{renderBlock(geo(), c)}</>);
  await waitFor(() => expect(els.length).toBeGreaterThan(3));
  fireEvent.click(screen.getByRole("button", { name: "Điểm" }));
  boardH.down({});
  expect(pt("D").args).toEqual([1.5, 2.5]);
  boardH.down({});
  expect(pt("E")).toBeDefined();
  expect(c.report).toHaveBeenCalledWith("construction_made", { block_id: "geo1", type: "point", deps: [] });
});

test("perpendicular takes a line then a point", async () => {
  setupGeo();
  const c = ctxR();
  render(<>{renderBlock(geo(), c)}</>);
  await waitFor(() => expect(els.length).toBeGreaterThan(3));
  fireEvent.click(screen.getByRole("button", { name: "Vuông góc" }));
  els.find((e) => e.kind === "segment")!.h.down({});
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Chọn 1 điểm"));
  pt("C").h.down({});
  expect(c.report).toHaveBeenCalledWith("construction_made", { block_id: "geo1", type: "perpendicular", deps: ["A", "B", "C"] });
});

test("one pointer event on a point and its segment builds once", async () => {
  setupGeo();
  const c = ctxR();
  render(<>{renderBlock(geo(), c)}</>);
  await waitFor(() => expect(els.length).toBeGreaterThan(3));
  fireEvent.click(screen.getByRole("button", { name: "Vuông góc" }));
  els.find((e) => e.kind === "segment")!.h.down({});
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Chọn 1 điểm"));
  const ev = {};
  pt("A").h.down(ev);
  els.find((e) => e.kind === "segment")!.h.down(ev);
  await new Promise((r) => setTimeout(r, 0));
  expect(c.report).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status").textContent).toBe("Chọn 1 đường");
});

test("nextName skips fixed ids and continues A1 after Z", async () => {
  setupGeo();
  render(<>{renderBlock(geo({ points: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 1, y: 0 }, { id: "D", x: 2, y: 0 }], segments: [], circles: [] }), ctxR())}</>);
  await waitFor(() => expect(els.length).toBe(3));
  fireEvent.click(screen.getByRole("button", { name: "Điểm" }));
  boardH.down({});
  expect(pt("C")).toBeDefined();
  boardH.down({});
  expect(pt("E")).toBeDefined();
  for (let i = 0; i < 21; i++) boardH.down({}); // F..Z
  boardH.down({});
  expect(pt("A1")).toBeDefined();
  boardH.down({});
  expect(pt("A2")).toBeDefined();
});

test("real dispatch order: line pick survives the board handler", async () => {
  setupGeo();
  const c = ctxR();
  render(<>{renderBlock(geo(), c)}</>);
  await waitFor(() => expect(els.length).toBeGreaterThan(3));
  fireEvent.click(screen.getByRole("button", { name: "Vuông góc" }));
  const seg = els.find((e) => e.kind === "segment")!;
  const e1 = {};
  seg.h.down(e1);
  boardH.down(e1);
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Chọn 1 điểm"));
  const e2 = {};
  pt("A").h.down(e2);
  seg.h.down(e2);
  boardH.down(e2);
  await new Promise((r) => setTimeout(r, 0));
  expect(c.report).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status").textContent).toBe("Chọn 1 đường");
});

test("point tool on empty board creates one point", async () => {
  setupGeo();
  const c = ctxR();
  render(<>{renderBlock(geo(), c)}</>);
  await waitFor(() => expect(els.length).toBeGreaterThan(3));
  fireEvent.click(screen.getByRole("button", { name: "Điểm" }));
  boardH.down({});
  expect(els.filter((e) => e.kind === "point")).toHaveLength(4);
  expect(c.report).toHaveBeenCalledTimes(1);
});
