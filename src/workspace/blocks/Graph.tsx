import { useEffect, useRef, useState } from "react";
import type { Block, BlockProps } from "../types";
import styles from "./Board.module.css";

type GraphBlock = Extract<Block, { type: "graph" }>;
type Fn = (x: number) => number;
// Only the slice of JSXGraph's Board we use; the package types are far wider than needed.
type Board = {
  create: (type: string, args: unknown[], attrs?: object) => unknown;
  update: () => void;
  setBoundingBox: (bb: number[], keepaspectratio?: boolean) => void;
  jc: { scope: { locals: Record<string, number> }; snippet: (code: string, wrap: boolean, vars: string) => Fn };
};

function sampledRange(fns: Fn[], [x0, x1]: [number, number]): [number, number] {
  const ys: number[] = [];
  for (const f of fns) for (let i = 0; i <= 200; i++) ys.push(f(x0 + ((x1 - x0) * i) / 200));
  const fin = ys.filter(Number.isFinite);
  if (!fin.length) return [-10, 10];
  const lo = Math.min(...fin);
  const hi = Math.max(...fin);
  const pad = (hi - lo) * 0.1 || 1;
  return [lo - pad, hi + pad];
}

export function Graph({ block }: BlockProps<GraphBlock>) {
  const box = useRef<HTMLDivElement>(null);
  const board = useRef<Board | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [vals, setVals] = useState(() => Object.fromEntries((block.sliders ?? []).map((s) => [s.name, s.value])));
  if (error) throw error; // BlockBoundary reports render_error

  useEffect(() => {
    let dead = false;
    let b: Board | null = null;
    let freeBoard: ((b: Board) => void) | undefined;
    import("jsxgraph")
      .then(({ default: JXG }) => {
        if (dead || !box.current) return;
        const [x0, x1] = block.x;
        const [ylo, yhi] = block.y ?? [-10, 10];
        b = JXG.JSXGraph.initBoard(box.current, {
          boundingbox: [x0, yhi, x1, ylo],
          axis: true,
          showCopyright: false,
          showNavigation: false,
        }) as unknown as Board;
        freeBoard = (x) => JXG.JSXGraph.freeBoard(x as never);
        board.current = b;
        // Slider names live in the JessieCode global scope, so a term like "a*x^2" resolves `a` on every evaluation.
        Object.assign(b.jc.scope.locals, Object.fromEntries((block.sliders ?? []).map((s) => [s.name, s.value])));
        const fns = block.fns.map((f) => b!.jc.snippet(f.expr, true, "x"));
        if (!block.y) {
          const [lo, hi] = sampledRange(fns, block.x);
          b.setBoundingBox([x0, hi, x1, lo], true);
        }
        fns.forEach((f, i) => b!.create("functiongraph", [f, x0, x1], { name: block.fns[i].label, withLabel: true }));
        block.points?.forEach((p) => b!.create("point", [p.x, p.y], { name: p.label, fixed: true }));
      })
      .catch((e) => !dead && setError(e instanceof Error ? e : new Error(String(e))));
    return () => {
      dead = true;
      if (b && freeBoard) freeBoard(b);
      board.current = null;
    };
  }, [block]);

  return (
    <div className={styles.wrap}>
      <div ref={box} className={styles.board} />
      {block.sliders && (
        <div className={styles.sliders}>
          {block.sliders.map((s) => (
            <label key={s.name} className={styles.slider}>
              <span>
                {s.name} = <span className={styles.value}>{vals[s.name]}</span>
              </span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step="any"
                value={vals[s.name]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVals((p) => ({ ...p, [s.name]: v }));
                  if (board.current) {
                    board.current.jc.scope.locals[s.name] = v;
                    board.current.update();
                  }
                }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
