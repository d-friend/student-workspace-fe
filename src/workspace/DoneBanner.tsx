import { IconCheck } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import styles from "./blocks/working.module.css";

export function DoneBanner({ hints }: { hints: number }) {
  return (
    <div className={styles.done} role="status">
      <div className={styles.doneMain}>
        <IconCheck size={20} stroke={2} aria-hidden="true" />
        <b>{copy.doneLabel}</b>
      </div>
      {hints > 0 && <p className={styles.doneHints}>{copy.doneHints(hints)}</p>}
    </div>
  );
}
