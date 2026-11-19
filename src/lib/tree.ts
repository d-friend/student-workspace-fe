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
