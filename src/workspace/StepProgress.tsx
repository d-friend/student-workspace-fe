import { useId, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { track } from "@/lib/track";
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

export function StepProgress({ block, state, overrides = {}, sessionId }: { block: StepsBlock; state?: StudentWork | null; overrides?: Record<number, "ok" | "review">; sessionId?: string | null }) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const total = block.scaffold?.length ?? 0;
  if (!total) return null;
  const accepted = acceptedSteps(block, state, overrides);
  const complete = accepted >= total;
  const current = Math.min(accepted + 1, total);
  const nodes = block.roadmap && Object.hasOwn(copy.roadmaps, block.roadmap) ? copy.roadmaps[block.roadmap] : undefined;
  const stage = complete ? undefined : block.scaffold?.[current - 1]?.stage;
  const items = nodes?.map((name, i) => (
    <span key={i} className={`${styles.progressNode} ${(complete || (stage !== undefined && i < stage)) ? styles.progressDone : ""} ${i === stage ? styles.progressCurrent : ""}`} aria-current={i === stage ? "step" : undefined}>
      <span className={styles.progressMarker} aria-hidden="true">{(complete || (stage !== undefined && i < stage)) ? "✓" : i + 1}</span>
      <span className={styles.progressName}>{name}</span>
    </span>
  ));
  return (
    <div className={styles.progress}>
      {nodes ? <>
        <div className={styles.progressRow}>
          <div className={styles.progressNodes}>{items}</div>
          {/* Phones have no room for six names in a row: the row shows the current stage, and a tap lists them all. */}
          <button type="button" className={styles.progressToggle} aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => {
            if (!open) track("roadmap_opened", { block_id: block.id }, sessionId);
            setOpen(!open);
          }}>{stage !== undefined && nodes[stage] ? `${copy.approach}: ${nodes[stage]}` : copy.approach}<IconChevronDown size={18} aria-hidden="true" className={open ? styles.progressChevronOpen : undefined} /></button>
          <span className={styles.progressCount} aria-label={copy.stepProgress(current, total)}>{current}/{total}</span>
        </div>
        {open && <div id={listId} className={styles.progressList}>{items}</div>}
      </> : <span>{copy.stepProgress(current, total)}</span>}
    </div>
  );
}
