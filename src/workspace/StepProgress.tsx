import { useCopy } from "./WorkspaceCopy";
import type { Block, StudentWork } from "./types";
import styles from "./WorkspaceView.module.css";

type StepsBlock = Extract<Block, { type: "steps" }>;

export function acceptedSteps(block: StepsBlock, state?: StudentWork | null, overrides: Record<number, "ok" | "review"> = {}) {
  const saved = state?.blocks?.[block.id];
  const entries = saved?.type === "steps" ? saved.entries : [];
  let accepted = 0;
  while (accepted < entries.length && (overrides[accepted + 1] ?? entries[accepted].state) === "ok") accepted++;
  return accepted;
}

export function StepProgress({ block, state, overrides = {} }: { block: StepsBlock; state?: StudentWork | null; overrides?: Record<number, "ok" | "review"> }) {
  const copy = useCopy();
  const total = block.scaffold?.length ?? 0;
  if (!total) return null;
  const accepted = acceptedSteps(block, state, overrides);
  const complete = accepted >= total;
  const current = Math.min(accepted + 1, total);
  const nodes = block.roadmap && Object.hasOwn(copy.roadmaps, block.roadmap) ? copy.roadmaps[block.roadmap] : undefined;
  const stage = complete ? undefined : block.scaffold?.[current - 1]?.stage;
  return (
    <div className={styles.progress}>
      {nodes ? <div className={styles.progressRow}><div className={styles.progressNodes}>{nodes.map((name, i) => (
        <span key={i} className={`${styles.progressNode} ${(complete || (stage !== undefined && i < stage)) ? styles.progressDone : ""} ${i === stage ? styles.progressCurrent : ""}`} aria-current={i === stage ? "step" : undefined}>
          <span className={styles.progressMarker} aria-hidden="true">{(complete || (stage !== undefined && i < stage)) ? "✓" : i + 1}</span>
          <span className={styles.progressName}>{name}</span>
        </span>
      ))}</div><span className={styles.progressCount} aria-label={copy.stepProgress(current, total)}>{current}/{total}</span></div> : <span>{copy.stepProgress(current, total)}</span>}
    </div>
  );
}
