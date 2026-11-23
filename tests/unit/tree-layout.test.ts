import { expect, test } from "vitest";
import type { TreeNode } from "@/lib/api";
import { defaultCollapsed, mapTree, ROOT_ID, treeRows, visibleOrder } from "@/lib/tree";
import { edgePath, layoutTree, type LayoutNode, type Placed } from "@/lib/treeLayout";

const leaf = (id: string): LayoutNode => ({ id, children: [] });
const branch = (id: string, ...children: LayoutNode[]): LayoutNode => ({ id, children });
const widths: Record<string, number> = { root: 120, s1: 80, s2: 100, t1: 140, t2: 90, t3: 60, y1: 70, y2: 200, y3: 50 };
const heights: Record<string, number> = { s1: 90 };
const size = (id: string) => ({ w: widths[id] ?? 60, h: heights[id] ?? 40 });
const fixture = () => branch("root", branch("s1", branch("t1", leaf("y1"), leaf("y2")), leaf("t2")), branch("s2", branch("t3", leaf("y3"))));

const overlaps = (a: Placed, b: Placed) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("columns start at the previous column's x plus its widest node plus the gap", () => {
  const { placed } = layoutTree(fixture(), size, 96, 12);
  expect(placed.get("root")!.x).toBe(0);
  expect(placed.get("s1")!.x).toBe(120 + 96);
  expect(placed.get("t1")!.x).toBe(120 + 96 + 100 + 96); // s2 (100) is the widest subject
  expect(placed.get("y1")!.x).toBe(placed.get("y2")!.x);
  expect(placed.get("y1")!.x).toBe(120 + 96 + 100 + 96 + 140 + 96);
});

test("no two nodes overlap, and nodes of one column keep the vertical gap", () => {
  const { placed } = layoutTree(fixture(), size, 96, 12);
  const all = [...placed.entries()];
  for (const [ida, a] of all) for (const [idb, b] of all) if (ida < idb) expect(overlaps(a, b), `${ida} vs ${idb}`).toBe(false);
  const column = (depth: number) => all.map(([, p]) => p).filter(p => p.depth === depth).sort((a, b) => a.y - b.y);
  for (let depth = 0; depth < 4; depth++) {
    const nodes = column(depth);
    for (let i = 1; i < nodes.length; i++) expect(nodes[i].y - (nodes[i - 1].y + nodes[i - 1].h)).toBeGreaterThanOrEqual(12);
  }
});

test("a parent is centred on its first and last child, even when it is taller than its children", () => {
  const { placed } = layoutTree(fixture(), size, 96, 12);
  const centre = (id: string) => placed.get(id)!.y + placed.get(id)!.h / 2;
  expect(centre("t1")).toBe((centre("y1") + centre("y2")) / 2);
  expect(centre("s1")).toBe((centre("t1") + centre("t2")) / 2);
  expect(centre("s2")).toBe(centre("t3"));
  expect(centre("t3")).toBe(centre("y3"));
  expect(centre("root")).toBe((centre("s1") + centre("s2")) / 2);
  // s1 is 90 high with children spanning less than that; it must still sit inside its own band, below nothing above it.
  expect(Math.min(...[...placed.values()].map(p => p.y))).toBeGreaterThanOrEqual(0);
});

test("visible leaves stack top to bottom and the layout reports its size", () => {
  const { placed, width, height } = layoutTree(fixture(), size, 96, 12);
  const ys = ["y1", "y2", "t2", "y3"].map(id => placed.get(id)!.y);
  expect(ys).toEqual([...ys].sort((a, b) => a - b));
  expect(width).toBe(placed.get("y2")!.x + 200);
  expect(height).toBe(Math.max(...[...placed.values()].map(p => p.y + p.h)));
  expect(layoutTree(leaf("only"), size).placed.get("only")).toMatchObject({ x: 0, y: 0 });
});

test("an edge runs from the parent's right-middle to the child's left-middle", () => {
  const parent = { x: 0, y: 0, w: 100, h: 40, depth: 0 }, child = { x: 200, y: 100, w: 50, h: 20, depth: 1 };
  expect(edgePath(parent, child)).toBe("M100 20C150 20 150 110 200 110");
});

const node = (id: string, parent_id: string | null, level: TreeNode["level"]): TreeNode => ({
  id, level, parent_id, name: id, grades: [], attempts: 0, solo: 0, rate: null, unfinished: 0, learned: 0, packs: 0, last_seen: "2026-11-19T08:00:00Z",
});
const small = () => treeRows([node("m", null, "subject"), node("m.a", "m", "topic"), node("m.a.x", "m.a", "type"), node("m.a.y", "m.a", "type"), node("m.b", "m", "topic"), node("p", null, "subject")]);

test("collapsing hides the children and keeps their count on the node; the root can collapse too", () => {
  const open = mapTree(small(), new Set());
  expect(open.id).toBe(ROOT_ID);
  expect(visibleOrder(open).map(n => n.id)).toEqual([ROOT_ID, "m", "m.a", "m.a.x", "m.a.y", "m.b", "p"]);
  const folded = mapTree(small(), new Set(["m.a"]));
  expect(visibleOrder(folded).map(n => n.id)).toEqual([ROOT_ID, "m", "m.a", "m.b", "p"]);
  expect(visibleOrder(folded).find(n => n.id === "m.a")).toMatchObject({ hidden: 2, children: [] });
  expect(visibleOrder(folded).find(n => n.id === "m.b")!.hidden).toBe(0); // a leaf never counts as collapsed
  expect(mapTree(small(), new Set([ROOT_ID]))).toMatchObject({ hidden: 2, children: [] });
});

test("everything starts expanded up to 30 leaves, beyond that the types fold into their topics", () => {
  expect(defaultCollapsed(small()).size).toBe(0);
  const many = (n: number) => treeRows([
    node("s", null, "subject"), node("s.t", "s", "topic"), node("s.t.0", "s.t", "type"),
    ...Array.from({ length: n - 1 }, (_, i) => node(`s.u${i}`, "s", "topic")), node("s.v", "s", "topic"), node("s.v.0", "s.v", "type"),
  ]);
  expect(defaultCollapsed(many(29)).size).toBe(0); // many(n) has n + 1 leaves: exactly 30 stays expanded
  expect([...defaultCollapsed(many(30))].sort()).toEqual(["s.t", "s.v"]); // 31 leaves
});
