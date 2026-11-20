import type { TreeNode, TreeWorkspace } from "./api";
import { copy } from "./copy";

export type TreeRow = { node: TreeNode; children: TreeRow[] };

// Nests nodes under parent_id and keeps the API order inside each level. A node whose parent is not in the payload becomes a root.
export function treeRows(nodes: TreeNode[]): TreeRow[] {
  const ids = new Set(nodes.map(node => node.id));
  const byParent = new Map<string | null, TreeNode[]>();
  for (const node of nodes) {
    const key = node.parent_id !== null && ids.has(node.parent_id) ? node.parent_id : null;
    byParent.set(key, [...byParent.get(key) ?? [], node]);
  }
  const build = (parent: string | null): TreeRow[] => (byParent.get(parent) ?? []).map(node => ({ node, children: build(node.id) }));
  return build(null);
}

// Workspaces of the node and its whole subtree, newest first.
export function nodeWorkspaces(nodes: TreeNode[], workspaces: TreeWorkspace[], nodeId: string): TreeWorkspace[] {
  const inside = new Set([nodeId]);
  // Parents may come after children in the payload, so repeat until nothing new joins.
  for (let grew = true; grew;) {
    grew = false;
    for (const node of nodes) if (node.parent_id !== null && inside.has(node.parent_id) && !inside.has(node.id)) { inside.add(node.id); grew = true; }
  }
  return workspaces.filter(ws => inside.has(ws.node_id)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

// Counts only: no percentage, score or level word (spec §0).
export function nodeCounts(node: TreeNode): string[] {
  return [
    node.attempts > 0 ? copy.treeAttempts(node.attempts, node.solo) : "",
    node.learned > 0 ? copy.treeLearned(node.learned) : "",
    node.unfinished > 0 ? copy.treeUnfinished(node.unfinished) : "",
  ].filter(Boolean);
}

// Fill strength in percent for the dot, or null (hollow) when no finished solve is counted. Never below 15, so zero hint-free work still reads as "has work".
export function nodeFill(rate: number | null): number | null {
  return rate === null ? null : Math.round(15 + 85 * Math.min(1, Math.max(0, rate)));
}

export const ROOT_ID = "__root__";
const EXPAND_ALL_LEAVES = 30;

// A node of the visible map. `node` is null for the synthetic root; `hidden` is the direct child count while the node is collapsed.
export type MapNode = { id: string; node: TreeNode | null; children: MapNode[]; hidden: number };

export function mapTree(rows: TreeRow[], collapsed: ReadonlySet<string>): MapNode {
  const build = (row: TreeRow): MapNode => {
    const folded = collapsed.has(row.node.id) && row.children.length > 0;
    return { id: row.node.id, node: row.node, children: folded ? [] : row.children.map(build), hidden: folded ? row.children.length : 0 };
  };
  const folded = collapsed.has(ROOT_ID) && rows.length > 0;
  return { id: ROOT_ID, node: null, children: folded ? [] : rows.map(build), hidden: folded ? rows.length : 0 };
}

// Everything starts expanded up to 30 leaves; a bigger tree starts with the types folded into their topics.
export function defaultCollapsed(rows: TreeRow[]): Set<string> {
  const leaves = (list: TreeRow[]): number => list.reduce((sum, row) => sum + (row.children.length ? leaves(row.children) : 1), 0);
  const folded = new Set<string>();
  if (leaves(rows) <= EXPAND_ALL_LEAVES) return folded;
  const visit = (list: TreeRow[]) => list.forEach(row => {
    if (row.children.some(child => child.node.level === "type")) folded.add(row.node.id);
    else visit(row.children);
  });
  visit(rows);
  return folded;
}

// Visible nodes top to bottom as the keyboard walks them (parent before its children).
export function visibleOrder(root: MapNode): MapNode[] {
  return [root, ...root.children.flatMap(visibleOrder)];
}
