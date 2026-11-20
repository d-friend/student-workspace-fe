import { IconChevronLeft, IconMinus, IconPlus } from "@tabler/icons-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { TreeResponse } from "@/lib/api";
import { copy } from "@/lib/copy";
import { track } from "@/lib/track";
import { defaultCollapsed, mapTree, nodeFill, ROOT_ID, treeRows, visibleOrder, type MapNode } from "@/lib/tree";
import { edgePath, layoutTree, type Size } from "@/lib/treeLayout";
import styles from "./KnowledgeTree.module.css";

type Props = { data: TreeResponse; selected: string | null; onSelect: (nodeId: string | null) => void };
type View = { x: number; y: number; k: number };

const FALLBACK: Size = { w: 160, h: 44 }; // until the first measurement (and in jsdom, which measures nothing)
const MIN_K = 0.2, MAX_K = 2, PAD = 24;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// NotebookLM-style mind map (spec-v2 §3): root → subject → topic → type, absolutely positioned HTML nodes over one SVG of edges, panned and zoomed by a CSS transform.
export function KnowledgeTree({ data, selected, onSelect }: Props) {
  const rows = useMemo(() => treeRows(data.nodes), [data.nodes]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => defaultCollapsed(rows));
  const root = useMemo(() => mapTree(rows, collapsed), [rows, collapsed]);
  const order = useMemo(() => visibleOrder(root), [root]);
  const parents = useMemo(() => {
    const map = new Map<string, string>();
    for (const parent of order) for (const child of parent.children) map.set(child.id, parent.id);
    return map;
  }, [order]);
  const [sizes, setSizes] = useState<ReadonlyMap<string, Size>>(new Map());
  const layout = useMemo(() => layoutTree(root, id => sizes.get(id) ?? FALLBACK), [root, sizes]);
  const [view, setView] = useState<View>({ x: PAD, y: PAD, k: 1 });
  const [focusId, setFocusId] = useState(ROOT_ID);
  const viewport = useRef<HTMLDivElement>(null);
  const boxes = useRef(new Map<string, HTMLElement>());
  const items = useRef(new Map<string, HTMLElement>());
  const fitted = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number; sx: number; sy: number }>());
  const gesture = useRef({ moved: false, dist: 0 });

  const measure = useCallback(() => setSizes(prev => {
    let next: Map<string, Size> | null = null;
    for (const [id, el] of boxes.current) {
      const w = el.offsetWidth, h = el.offsetHeight, old = prev.get(id);
      if ((w || h) && (!old || old.w !== w || old.h !== h)) (next ??= new Map(prev)).set(id, { w, h });
    }
    return next ?? prev;
  }), []);
  useLayoutEffect(measure); // after every render; a no-op unless a node's size changed
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure); // web fonts arriving after the first measure
    boxes.current.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [order, measure]);

  const fit = useCallback(() => {
    const vp = viewport.current;
    if (!vp || !layout.width || !vp.clientWidth || !vp.clientHeight) return;
    const k = clamp(Math.min((vp.clientWidth - 2 * PAD) / layout.width, (vp.clientHeight - 2 * PAD) / layout.height, 1), MIN_K, MAX_K);
    setView({ k, x: (vp.clientWidth - layout.width * k) / 2, y: (vp.clientHeight - layout.height * k) / 2 });
  }, [layout.width, layout.height]);
  useLayoutEffect(() => {
    if (fitted.current || sizes.size === 0) return;
    fitted.current = true;
    fit();
  }, [sizes, fit]);

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => setView(v => {
    const k = clamp(v.k * factor, MIN_K, MAX_K), f = k / v.k;
    return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
  }), []);
  const zoomCentre = (factor: number) => zoomAt((viewport.current?.clientWidth ?? 0) / 2, (viewport.current?.clientHeight ?? 0) / 2, factor);
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    // Native listener: React's onWheel is passive and could not stop the page from scrolling.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { moved: true, dist: Math.hypot(a.x - b.x, a.y - b.y) };
    } else gesture.current = { moved: false, dist: 0 };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    if (pointers.current.size === 1) {
      // A press that barely moves stays a click on the node under it; only a real drag captures the pointer and pans.
      if (!gesture.current.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 4) return;
      if (!gesture.current.moved) e.currentTarget.setPointerCapture?.(e.pointerId);
      gesture.current.moved = true;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
    } else {
      const [a, b] = [...pointers.current.entries()].map(([id, q]) => id === e.pointerId ? { ...q, x: e.clientX, y: e.clientY } : q);
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = e.currentTarget.getBoundingClientRect();
      const midX = (a.x + b.x) / 2 - rect.left, midY = (a.y + b.y) / 2 - rect.top;
      const was = [...pointers.current.values()];
      const dx = midX - ((was[0].x + was[1].x) / 2 - rect.left), dy = midY - ((was[0].y + was[1].y) / 2 - rect.top);
      if (gesture.current.dist > 0) zoomAt(midX, midY, dist / gesture.current.dist);
      setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
      gesture.current.dist = dist;
    }
    p.x = e.clientX; p.y = e.clientY;
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    gesture.current.dist = 0;
  };

  const toggle = (id: string) => setCollapsed(prev => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; });
  const pick = (mapNode: MapNode) => {
    if (mapNode.node) track("tree_node_clicked", { node_id: mapNode.node.id, level: mapNode.node.level });
    onSelect(mapNode.node?.id ?? null);
  };

  const reveal = (id: string) => {
    const p = layout.placed.get(id), vp = viewport.current;
    if (!p || !vp) return;
    const x0 = view.x + p.x * view.k, y0 = view.y + p.y * view.k, x1 = x0 + p.w * view.k, y1 = y0 + p.h * view.k;
    const dx = x0 < PAD ? PAD - x0 : x1 > vp.clientWidth - PAD ? vp.clientWidth - PAD - x1 : 0;
    const dy = y0 < PAD ? PAD - y0 : y1 > vp.clientHeight - PAD ? vp.clientHeight - PAD - y1 : 0;
    if (dx || dy) setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const move = (id: string) => {
    setFocusId(id);
    items.current.get(id)?.focus({ preventScroll: true });
    reveal(id);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
    const at = order.findIndex(n => n.id === id);
    if (id === undefined || at < 0) return;
    const current = order[at];
    let target: string | undefined;
    switch (e.key) {
      case "ArrowDown": target = order[at + 1]?.id; break;
      case "ArrowUp": target = order[at - 1]?.id; break;
      case "Home": target = order[0].id; break;
      case "End": target = order[order.length - 1].id; break;
      case "ArrowRight":
        if (current.hidden > 0) toggle(id); else target = current.children[0]?.id;
        break;
      case "ArrowLeft":
        if (current.children.length > 0) toggle(id); else target = parents.get(id);
        break;
      default: return;
    }
    e.preventDefault();
    if (target !== undefined) move(target);
  };

  const tabStop = order.some(n => n.id === focusId) ? focusId : ROOT_ID;
  return <section aria-label={copy.treeTitle} className={styles.tree}>
    <div ref={viewport} role="tree" aria-label={copy.treeRoot} className={styles.viewport}
      onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
      <div className={styles.canvas} style={{ width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className={styles.edges} width={layout.width} height={layout.height} aria-hidden="true">
          {order.flatMap(parent => parent.children.map(child =>
            <path key={child.id} d={edgePath(layout.placed.get(parent.id)!, layout.placed.get(child.id)!)} />))}
        </svg>
        {order.map(mapNode => {
          const { node } = mapNode, p = layout.placed.get(mapNode.id)!;
          const fill = node ? nodeFill(node.rate) : null;
          const name = node?.name ?? copy.treeRoot;
          const expandable = mapNode.children.length > 0 || mapNode.hidden > 0;
          return <div key={mapNode.id} role="none" className={styles.node} data-node-id={mapNode.id} data-kind={node?.level ?? "root"}
            ref={el => { if (el) boxes.current.set(mapNode.id, el); else boxes.current.delete(mapNode.id); }}
            style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
            <button type="button" role="treeitem" className={styles.label} tabIndex={tabStop === mapNode.id ? 0 : -1}
              aria-level={p.depth + 1} aria-selected={node ? selected === node.id : selected === null}
              aria-expanded={expandable ? mapNode.hidden === 0 : undefined}
              ref={el => { if (el) items.current.set(mapNode.id, el); else items.current.delete(mapNode.id); }}
              onFocus={() => setFocusId(mapNode.id)} onClick={() => pick(mapNode)}>
              {node && <span className={styles.dot} data-hollow={fill === null || undefined} style={fill === null ? undefined : { "--fill": `${fill}%` } as CSSProperties} aria-hidden="true" />}
              <span className={styles.name}>{name}</span>
            </button>
            {expandable && <button type="button" className={styles.toggle} tabIndex={-1} aria-label={copy.treeToggle(name)} aria-expanded={mapNode.hidden === 0} onClick={() => toggle(mapNode.id)}>
              {mapNode.hidden > 0 ? mapNode.hidden : <IconChevronLeft size={14} aria-hidden="true" />}
            </button>}
          </div>;
        })}
      </div>
    </div>
    <div className={styles.controls}>
      <button type="button" className={styles.control} aria-label={copy.treeZoomOut} onClick={() => zoomCentre(1 / 1.25)}><IconMinus size={18} aria-hidden="true" /></button>
      <button type="button" className={styles.control} aria-label={copy.treeZoomIn} onClick={() => zoomCentre(1.25)}><IconPlus size={18} aria-hidden="true" /></button>
      <button type="button" className={styles.control} onClick={fit}>{copy.treeFit}</button>
    </div>
  </section>;
}
