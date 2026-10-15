import { IconPlus } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import styles from "./RailHeader.module.css";

export function RailHeader({ showNewProblem, onNewProblem }: { showNewProblem: boolean; onNewProblem: () => void }) {
  return (
    <header className={styles.header}>
      <span className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          D
        </span>
        <span className={styles.wordmark}>D-Friend</span>
      </span>
      {showNewProblem && (
        <button type="button" className={styles.newProblem} onClick={onNewProblem}>
          <IconPlus size={16} aria-hidden="true" />
          {copy.newProblem}
        </button>
      )}
    </header>
  );
}
