import { copy } from "@/lib/copy";
import type { Block, StudentWork } from "./types";
import styles from "./WorkspaceView.module.css";

type StepsBlock = Extract<Block, { type: "steps" }>;

export function StepProgress({ block, state, overrides = {} }: { block: StepsBlock; state?: StudentWork | null; overrides?: Record<number, "ok" | "review"> }) {
  const total = block.scaffold?.length ?? 0;
  if (!total) return null;
  const saved = state?.blocks?.[block.id];
  const entries = saved?.type === "steps" ? saved.entries : [];
  let accepted = 0;
  while (accepted < entries.length && (overrides[accepted + 1] ?? entries[accepted].state) === "ok") accepted++;
  const current = Math.min(accepted + 1, total);
  const nodes = block.roadmap ? copy.roadmaps?.[block.roadmap] : undefined;
  const stage = block.scaffold?.[current - 1]?.stage;
  return (
    <div className={styles.progress}>
      <span>{copy.stepProgress(current, total)}</span>
      {nodes && <div className={styles.progressNodes}>{nodes.map((name, i) => (
        <span key={i} className={i === stage ? styles.progressCurrent : styles.progressNode} aria-current={i === stage ? "step" : undefined}>{name}</span>
      ))}</div>}
    </div>
  );
}
