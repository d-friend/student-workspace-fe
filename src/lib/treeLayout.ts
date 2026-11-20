// Tidy left-to-right tree layout for the knowledge map (spec-v2 §3): one column per depth, visible leaves stacked, parents centred on their children.
export type LayoutNode = { id: string; children: LayoutNode[] };
export type Size = { w: number; h: number };
export type Placed = Size & { x: number; y: number; depth: number };
export type TreeLayout = { placed: Map<string, Placed>; width: number; height: number };

export const GAP_X = 96;
export const GAP_Y = 12;

export function layoutTree(root: LayoutNode, size: (id: string) => Size, gapX = GAP_X, gapY = GAP_Y): TreeLayout {
  const placed = new Map<string, Placed>();
  const colW: number[] = [];
  const walk = (node: LayoutNode, depth: number) => {
    const { w, h } = size(node.id);
    placed.set(node.id, { x: 0, y: 0, w, h, depth });
    colW[depth] = Math.max(colW[depth] ?? 0, w);
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(root, 0);
  const colX: number[] = [];
  colW.forEach((w, depth) => { colX[depth] = depth === 0 ? 0 : colX[depth - 1] + colW[depth - 1] + gapX; });

  const shift = (node: LayoutNode, dy: number) => {
    placed.get(node.id)!.y += dy;
    for (const child of node.children) shift(child, dy);
  };
  // Lays the subtree inside the band starting at `top` and returns the band's bottom. Sibling bands never overlap, so nodes in one column never do either.
  const place = (node: LayoutNode, top: number): number => {
    const self = placed.get(node.id)!;
    self.x = colX[self.depth];
    if (node.children.length === 0) { self.y = top; return top + self.h; }
    let cursor = top;
    for (const child of node.children) cursor = place(child, cursor) + gapY;
    const first = placed.get(node.children[0].id)!;
    const last = placed.get(node.children[node.children.length - 1].id)!;
    self.y = (first.y + first.h / 2 + last.y + last.h / 2) / 2 - self.h / 2;
    let bottom = cursor - gapY;
    if (self.y < top) { // A node taller than its children's span would poke above its band: push the whole subtree down.
      const dy = top - self.y;
      for (const child of node.children) shift(child, dy);
      self.y = top;
      bottom += dy;
    }
    return Math.max(bottom, self.y + self.h);
  };
  const height = place(root, 0);
  const width = colW.length ? colX[colX.length - 1] + colW[colW.length - 1] : 0;
  return { placed, width, height };
}

// Cubic Bézier from the parent's right-middle to the child's left-middle.
export function edgePath(parent: Placed, child: Placed): string {
  const x1 = parent.x + parent.w, y1 = parent.y + parent.h / 2, x2 = child.x, y2 = child.y + child.h / 2, mx = (x1 + x2) / 2;
  return `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
}
