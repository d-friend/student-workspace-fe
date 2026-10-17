import { IconAngle, IconBoxAlignRight, IconCircle, IconEqual, IconLine, IconLineDashed, IconPoint, IconSquareDot } from "@tabler/icons-react";
import type { ComponentType, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import type { Block, BlockProps, GeometryTool } from "../types";
import styles from "./Board.module.css";

type GeoBlock = Extract<Block, { type: "geometry" }>;
// Only the slice of JSXGraph we use.
type El = { on: (ev: string, f: (e?: unknown) => void) => void };
type Board = {
  create: (type: string, args: unknown[], attrs?: object) => El;
  on: (ev: string, f: (e: unknown) => void) => void;
  getAllObjectsUnderMouse: (e: unknown) => unknown[];
  getUsrCoordsOfMouse: (e: unknown) => number[];
};

const ICONS: Record<GeometryTool, ComponentType<{ size?: number; stroke?: number }>> = {
  point: IconPoint,
  segment: IconLineDashed,
  line: IconLine,
  circle: IconCircle,
  midpoint: IconSquareDot,
  perpendicular: IconBoxAlignRight,
  parallel: IconEqual,
  angle: IconAngle,
};
// Points to collect per tool; perpendicular/parallel take a line (2 defining points) then a point.
const NEED: Record<GeometryTool, number> = { point: 0, segment: 2, line: 2, circle: 2, midpoint: 2, perpendicular: 3, parallel: 3, angle: 3 };

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim();

function nextName(used: Set<string>) {
  for (let i = 0; i < 26; i++) {
    const n = String.fromCharCode(65 + i);
    if (!used.has(n)) return n;
  }
  let i = 1;
  while (used.has(`A${i}`)) i++;
  return `A${i}`;
}

export function Geometry({ block, ctx }: BlockProps<GeoBlock>) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<Error | null>(null);
  const [tool, setTool] = useState<GeometryTool | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  if (error) throw error; // BlockBoundary reports render_error

  // Board handlers are bound once per board, so they read live state through this ref.
  const live = useRef({ tool, picks, ctx, block });
  useEffect(() => {
    live.current = { tool, picks, ctx, block };
  });
  const act = useRef<{ point: (n: string) => void; line: (a: string, b: string) => void; board: (e: unknown) => void } | null>(null);
  const select = (t: GeometryTool | null) => {
    setTool(t);
    setPicks([]);
  };

  useEffect(() => {
    let dead = false;
    let b: Board | null = null;
    let freeBoard: ((b: Board) => void) | undefined;
    const pts = new Map<string, El>();
    const names = new Set<string>();
    import("jsxgraph")
      .then(({ default: JXG }) => {
        if (dead || !box.current) return;
        const [text, accent] = ["--text", "--accent"].map((n) => cssVar(box.current!, n));
        const xs = block.points.map((p) => p.x);
        const ys = block.points.map((p) => p.y);
        const pad = 2;
        const [x0, x1] = [Math.min(...xs, 0) - pad, Math.max(...xs, 0) + pad];
        const [y0, y1] = [Math.min(...ys, 0) - pad, Math.max(...ys, 0) + pad];
        b = JXG.JSXGraph.initBoard(box.current, { boundingbox: [x0, y1, x1, y0], axis: false, grid: false, showCopyright: false, showNavigation: false, keepaspectratio: true }) as unknown as Board;
        const board = b;
        freeBoard = (x) => JXG.JSXGraph.freeBoard(x as never);
        const paint = { strokeColor: accent, highlightStrokeColor: accent, strokeWidth: 2 };
        const lineEl = (kind: string, a: string, c: string, attrs: object = {}) => {
          const el = board.create(kind, [pts.get(a), pts.get(c)], { ...paint, ...attrs });
          el?.on("down", () => act.current?.line(a, c));
          return el;
        };
        const makePoint = (name: string, args: unknown[], kind = "point") => {
          names.add(name);
          const el = board.create(kind, args, { name, fixed: true, size: 5, fillColor: accent, strokeColor: accent, highlightFillColor: accent, highlightStrokeColor: accent, label: { strokeColor: text } });
          pts.set(name, el);
          el?.on("down", () => act.current?.point(name));
          return el;
        };
        block.points.forEach((p) => makePoint(p.id, [p.x, p.y]));
        block.segments?.forEach(([a, c]) => lineEl("segment", a, c));
        block.circles?.forEach((c) => board.create("circle", [pts.get(c.center), pts.get(c.through)], paint));

        const done = (type: GeometryTool, deps: string[]) => {
          live.current.ctx.report("construction_made", { block_id: live.current.block.id, type, deps });
          live.current.picks = [];
          setPicks([]);
        };
        const build = (t: GeometryTool, d: string[]) => {
          const [p1, p2, p3] = d.map((n) => pts.get(n));
          if (t === "segment" || t === "line") lineEl(t, d[0], d[1]);
          else if (t === "circle") board.create("circle", [p1, p2], paint);
          else if (t === "midpoint") makePoint(nextName(names), [p1, p2], "midpoint");
          else if (t === "angle") board.create("angle", [p1, p2, p3], { ...paint, name: "" });
          else {
            // perpendicular/parallel: derive the helper line from the two defining points, then apply it to the third.
            const base = board.create("line", [p1, p2], { visible: false });
            board.create(t, [base, p3], paint);
          }
        };
        const push = (name: string, isLine?: [string, string]) => {
          const { tool: t, picks: cur } = live.current;
          if (!t || t === "point") return;
          const lineTool = t === "perpendicular" || t === "parallel";
          let next: string[];
          if (isLine) {
            if (!lineTool || cur.length) return;
            next = [...isLine];
          } else {
            if (lineTool ? cur.length !== 2 : cur.includes(name)) return;
            next = [...cur, name];
          }
          if (next.length < NEED[t]) {
            live.current.picks = next;
            setPicks(next);
          } else {
            build(t, next);
            done(t, next);
          }
        };
        act.current = {
          point: (n) => push(n),
          line: (a, c) => push("", [a, c]),
          board: (e) => {
            if (live.current.tool !== "point" || board.getAllObjectsUnderMouse(e).length) return;
            const [x, y] = board.getUsrCoordsOfMouse(e);
            makePoint(nextName(names), [x, y]);
            done("point", []);
          },
        };
        board.on("down", (e) => act.current?.board(e));
      })
      .catch((e) => !dead && setError(e instanceof Error ? e : new Error(String(e))));
    return () => {
      dead = true;
      if (b && freeBoard) freeBoard(b);
      act.current = null;
      select(null);
    };
  }, [block]);

  const lineTool = tool === "perpendicular" || tool === "parallel";
  const status = !tool
    ? copy.geoIdle
    : tool === "point"
      ? copy.geoClickBoard
      : lineTool
        ? picks.length === 0
          ? copy.geoPickLine
          : copy.geoPickPoints(1)
        : copy.geoPickPoints(NEED[tool] - picks.length);

  return (
    <div className={styles.wrap} onKeyDown={(e: KeyboardEvent) => e.key === "Escape" && select(null)}>
      <div className={styles.toolbar} role="group" aria-label={copy.geoToolbar}>
        {block.tools.map((t) => {
          const Icon = ICONS[t];
          return (
            <button key={t} type="button" className={styles.tool} aria-pressed={tool === t} onClick={() => select(tool === t ? null : t)}>
              <Icon size={20} stroke={2} />
              {copy.geoTools[t]}
            </button>
          );
        })}
      </div>
      <div ref={box} className={styles.board} />
      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
