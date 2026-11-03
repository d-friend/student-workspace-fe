import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { copy } from "@/lib/copy";
import { renderBlock } from "@/workspace/blocks";
import { staticFrame } from "@/workspace/blocks/Geometry";
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
  help: null,
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

test("custom renders iframe at block height", () => {
  const { container } = render(<>{renderBlock({ type: "custom", id: "c1", html: "<p>x</p>", height: 320, reason: "r" }, ctx)}</>);
  const f = container.querySelector("iframe")!;
  expect(f.style.height).toBe("320px");
  expect(f.getAttribute("srcdoc")).toContain("<p>x</p>");
});

test("boards have an accessible name and the toolbar icons are decorative", () => {
  setupGeo();
  const { unmount } = render(<>{renderBlock(graph(), ctx)}</>);
  expect(screen.getByRole("img", { name: "Đồ thị của y = ax^2, y = x" })).toBeTruthy();
  unmount();
  render(<>{renderBlock(geo(), ctx)}</>);
  expect(screen.getByRole("group", { name: "Bảng dựng hình, các điểm A, B, C" })).toBeTruthy();
  for (const svg of screen.getByRole("group", { name: copy.geoToolbar }).querySelectorAll("svg")) expect(svg.getAttribute("aria-hidden")).toBe("true");
});

// ---- static figure: labelled segments, arrows, empty tools ----
const boardOn = () => (jx.board as unknown as { on: ReturnType<typeof vi.fn> }).on;
const figure = (over: Partial<Extract<Block, { type: "geometry" }>> = {}): Block =>
  geo({
    points: [
      { id: "TP.HCM", x: 0, y: 0 },
      { id: "Gặp ?", x: 3, y: 0 },
      { id: "Cần Thơ", x: 6, y: 0 },
    ],
    segments: [
      { points: ["TP.HCM", "Cần Thơ"], label: "189 km" },
      { points: ["TP.HCM", "Gặp ?"], label: "v + 13", arrow: true },
      ["Gặp ?", "Cần Thơ"],
    ],
    circles: undefined,
    tools: [],
    ...over,
  });

test("segments show their label at the segment and an arrowhead at the second point; plain ones are unchanged", async () => {
  setupGeo();
  render(<>{renderBlock(figure(), ctx)}</>);
  await waitFor(() => expect(els.filter((e) => e.kind === "segment")).toHaveLength(3));
  const [labelled, arrow, plain] = els.filter((e) => e.kind === "segment");
  expect(labelled.args).toHaveLength(2);
  expect(labelled.attrs).toMatchObject({ name: "189 km", withLabel: true, label: expect.objectContaining({ strokeColor: "#111" }) });
  expect(labelled.attrs.lastArrow).toBeUndefined();
  expect(arrow.attrs).toMatchObject({ name: "v + 13", withLabel: true, lastArrow: true });
  expect(plain.attrs.name).toBeUndefined();
  expect(plain.attrs.withLabel).toBeUndefined();
  expect(plain.attrs.lastArrow).toBeUndefined();
});

test("the old tuple-only figure renders as before, with its toolbar", async () => {
  setupGeo();
  render(<>{renderBlock(geo(), ctx)}</>);
  await waitFor(() => expect(els.filter((e) => e.kind === "segment")).toHaveLength(1));
  const [seg] = els.filter((e) => e.kind === "segment");
  expect(seg.attrs.name).toBeUndefined();
  expect(seg.attrs.lastArrow).toBeUndefined();
  expect(seg.h.down).toBeDefined();
  expect(screen.getAllByRole("button")).toHaveLength(4);
  expect(screen.getByRole("status")).toBeTruthy();
});

test("empty tools is a static picture: no toolbar, no status, nothing to drag or pick", async () => {
  setupGeo();
  render(<>{renderBlock(figure(), ctx)}</>);
  await waitFor(() => expect(els.filter((e) => e.kind === "point")).toHaveLength(3));
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("group").getAttribute("aria-label")).toBe(copy.geoBoard(["TP.HCM", "Gặp ?", "Cần Thơ"]));
  expect(jx.initBoard).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ pan: { enabled: false }, zoom: { wheel: false } }));
  expect(boardOn()).not.toHaveBeenCalled(); // no pointer handler on the board
  for (const e of els) {
    expect(e.h.down).toBeUndefined(); // no element reacts to a press
    if (e.kind === "point") expect(e.attrs).toMatchObject({ fixed: true, highlight: false });
    if (e.kind === "segment") expect(e.attrs).toMatchObject({ fixed: true, highlight: false });
  }
});

test("with tools the board still takes pointer handlers and can pan", async () => {
  setupGeo();
  render(<>{renderBlock(geo(), ctx)}</>);
  await waitFor(() => expect(els.length).toBeGreaterThan(3));
  expect(boardOn()).toHaveBeenCalledWith("down", expect.any(Function));
  expect((jx.initBoard.mock.calls as unknown as [unknown, object][])[0][1]).not.toHaveProperty("pan");
});

// ---- static figure sizing ----
test("a 1-D road gets a wide strip and padding of at least 12% of its span, with no forced origin", () => {
  const { box, ratio } = staticFrame([{ x: 0, y: 0 }, { x: 189, y: 0 }]);
  const pad = 0.12 * 189;
  expect(box[0]).toBeLessThanOrEqual(0 - pad + 1e-9); // left edge
  expect(box[2]).toBeGreaterThanOrEqual(189 + pad - 1e-9); // right edge
  expect(ratio).toBeGreaterThanOrEqual(3);
  expect(ratio).toBe(4); // clamped: never wider than 4:1
});

test("the box comes from the points alone and the ratio stays between 1:1 and 4:1", () => {
  const far = staticFrame([{ x: 100, y: 100 }, { x: 110, y: 100 }]);
  expect(far.box[0]).toBeGreaterThan(0); // 0 is not forced in
  expect(far.box[3]).toBeGreaterThan(0);
  expect(far.box[0]).toBeCloseTo(100 - 1.2); // 12% of the span 10
  const tri = staticFrame([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }]);
  expect(tri.box).toEqual([-1, 4, 5, -1]); // pad is at least 1 unit
  expect(tri.ratio).toBeCloseTo(6 / 5);
  expect(staticFrame([{ x: 3, y: 3 }]).ratio).toBe(1); // one point: a square, not a division by zero
  expect(staticFrame([{ x: 0, y: 0 }, { x: 0, y: 50 }]).ratio).toBe(1); // a tall figure is not narrower than square
});

test("a static board takes its aspect ratio from the padded box and is drawn in that box", async () => {
  setupGeo();
  render(<>{renderBlock(figure({ points: [{ id: "TP.HCM", x: 0, y: 0 }, { id: "Cần Thơ", x: 189, y: 0 }], segments: [["TP.HCM", "Cần Thơ"]] }), ctx)}</>);
  await waitFor(() => expect(els.filter((e) => e.kind === "point")).toHaveLength(2));
  expect(parseFloat(screen.getByRole("group").style.aspectRatio)).toBe(4); // jsdom reads "4" back as "4 / 1"
  const opts = (jx.initBoard.mock.calls as unknown as [unknown, { boundingbox: number[]; keepaspectratio: boolean }][])[0][1];
  expect(opts.boundingbox).toEqual(staticFrame([{ x: 0, y: 0 }, { x: 189, y: 0 }]).box);
  expect(opts.keepaspectratio).toBe(true);
});

test("an interactive board keeps 4:3, the forced origin and the fixed padding", async () => {
  setupGeo();
  render(<>{renderBlock(geo(), ctx)}</>);
  await waitFor(() => expect(els.length).toBeGreaterThan(3));
  expect(screen.getByRole("group", { name: copy.geoBoard(["A", "B", "C"]) }).style.aspectRatio).toBe(""); // the CSS 4 / 3 applies
  const opts = (jx.initBoard.mock.calls as unknown as [unknown, { boundingbox: number[] }][])[0][1];
  expect(opts.boundingbox).toEqual([-2, 5, 6, -2]);
});
