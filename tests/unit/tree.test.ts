import { afterEach, expect, test } from "vitest";
import type { TreeNode, TreeWorkspace } from "@/lib/api";
import { setLocale } from "@/lib/copy";
import { nodeCounts, nodeFill, nodeWorkspaces, treeRows } from "@/lib/tree";

const node = (id: string, parent_id: string | null, extra: Partial<TreeNode> = {}): TreeNode => ({
  id, level: parent_id === null ? "subject" : "topic", parent_id, name: id, grades: [], attempts: 0, solo: 0, rate: null, unfinished: 0, learned: 0, last_seen: "2026-11-19T08:00:00Z", ...extra,
});
const ws = (id: string, node_id: string, created_at: string): TreeWorkspace => ({
  workspace_id: id, session_id: `s-${id}`, node_id, role: "primary", phase: "solve", title: id, created_at, finished: true, solo: true,
});
afterEach(() => setLocale("vi"));

test("treeRows nests by parent and keeps API order within each level", () => {
  const rows = treeRows([node("m", null), node("m.b", "m"), node("p", null), node("m.a", "m"), node("m.a.x", "m.a")]);
  expect(rows.map(row => row.node.id)).toEqual(["m", "p"]);
  expect(rows[0].children.map(row => row.node.id)).toEqual(["m.b", "m.a"]);
  expect(rows[0].children[1].children.map(row => row.node.id)).toEqual(["m.a.x"]);
  expect(treeRows([])).toEqual([]);
});

test("a node whose parent is missing from the payload is shown as a root", () => {
  expect(treeRows([node("t", "gone")]).map(row => row.node.id)).toEqual(["t"]);
});

test("nodeWorkspaces covers the node and its subtree, newest first, even when children precede parents", () => {
  const nodes = [node("m.a.x", "m.a"), node("m.a", "m"), node("m", null), node("p", null)];
  const list = [ws("old", "m.a.x", "2026-11-01T00:00:00Z"), ws("other", "p", "2026-11-18T00:00:00Z"), ws("direct", "m.a", "2026-11-10T00:00:00Z"), ws("top", "m", "2026-11-12T00:00:00Z")];
  expect(nodeWorkspaces(nodes, list, "m").map(w => w.workspace_id)).toEqual(["top", "direct", "old"]);
  expect(nodeWorkspaces(nodes, list, "m.a").map(w => w.workspace_id)).toEqual(["direct", "old"]);
  expect(nodeWorkspaces(nodes, list, "m.a.x").map(w => w.workspace_id)).toEqual(["old"]);
});

test.each(["vi", "en"] as const)("counts are plain numbers, only the parts that apply, and never a percentage (%s)", locale => {
  setLocale(locale);
  expect(nodeCounts(node("a", null))).toEqual([]);
  const all = nodeCounts(node("a", null, { attempts: 5, solo: 3, rate: 0.6, learned: 2, unfinished: 1 }));
  expect(all).toHaveLength(3);
  expect(all.join(" ")).not.toMatch(/%|0\.6|mastery|điểm/i);
  expect(nodeCounts(node("a", null, { learned: 1 }))).toHaveLength(1);
  expect(nodeCounts(node("a", null, { unfinished: 2 }))).toHaveLength(1);
});

test("nodeFill is hollow for null and continuous but never empty otherwise", () => {
  expect(nodeFill(null)).toBeNull();
  expect(nodeFill(0)).toBe(15);
  expect(nodeFill(1)).toBe(100);
  expect(nodeFill(0.5)).toBeGreaterThan(nodeFill(0.25)!);
  expect(nodeFill(2)).toBe(100);
  expect(nodeFill(-1)).toBe(15);
});
