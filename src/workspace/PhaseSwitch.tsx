import { copy } from "@/lib/copy";
import type { Phase } from "./types";
import styles from "./PhaseSwitch.module.css";

const LABEL: Record<Phase, string> = { learn: copy.phaseLearn, solve: copy.phaseSolve, practice: copy.phasePractice };

export function PhaseSwitch({ phases, phase, onPhase }: { phases: Phase[]; phase: Phase; onPhase: (p: Phase) => void }) {
  return (
    <div className={styles.bar} role="tablist">
      {phases.map((p) => (
        <button
          key={p}
          type="button"
          role="tab"
          id={`tab-${p}`}
          aria-selected={p === phase}
          aria-controls={`panel-${p}`}
          className={styles.seg}
          onClick={() => onPhase(p)}
        >
          {LABEL[p]}
        </button>
      ))}
    </div>
  );
}
