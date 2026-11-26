import { BuildingSkeleton } from "@/components/work/BuildingSkeleton";
import { InPlace } from "@/components/Skeleton";
import type { QueueItem } from "@/lib/api";
import { copy } from "@/lib/copy";
import styles from "./QueuedPanel.module.css";

// The tab of a queued problem that has nothing to show yet: being built, or failed.
export function QueuedPanel({ item, current, onBack, onBuild, busy }: {
  item: QueueItem;
  current: string | null; // the number of the problem the student can keep working on
  onBack: () => void;
  onBuild: () => void;
  busy: boolean;
}) {
  const failed = item.status === "failed";
  return (
    <div id={`panel-queue-${item.id}`} role="tabpanel" aria-labelledby={`tab-queue-${item.id}`} className={styles.panel}>
      <p className={styles.line}>{failed ? copy.queueFailed : copy.queuePreparing(current)}</p>
      <div className={styles.actions}>
        {failed && <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onBuild} disabled={busy}>
          <InPlace busy={busy}>{copy.pageRebuild}</InPlace>
        </button>}
        <button type="button" className={styles.button} onClick={onBack}>{copy.backToProblem}</button>
      </div>
      {!failed && <BuildingSkeleton variant="solve" />}
    </div>
  );
}
