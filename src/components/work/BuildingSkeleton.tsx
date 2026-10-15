import { copy } from "@/lib/copy";
import { StatusPill } from "./StatusPill";
import styles from "./BuildingSkeleton.module.css";

// Grey shapes in the shape of the working area, shown while the agent is still replying.
export function BuildingSkeleton({ status = copy.thinking }: { status?: string }) {
  return (
    <section className={styles.wrap} aria-busy="true">
      <StatusPill>{status}</StatusPill>
      <div className={styles.stack}>
        <div className={styles.card}>
          <span className={`${styles.block} ${styles.label}`} />
          <span className={`${styles.block} ${styles.line}`} />
          <span className={`${styles.block} ${styles.lineShort}`} />
        </div>
        <div className={styles.card}>
          <div className={styles.entry}>
            <span className={`${styles.block} ${styles.num}`} />
            <span className={`${styles.block} ${styles.input}`} />
          </div>
          <div className={styles.entry}>
            <span className={`${styles.block} ${styles.num}`} />
            <span className={`${styles.block} ${styles.input}`} />
            <span className={`${styles.block} ${styles.button}`} />
          </div>
        </div>
        <div className={styles.buttons}>
          <span className={`${styles.block} ${styles.pillA}`} />
          <span className={`${styles.block} ${styles.pillB}`} />
        </div>
      </div>
    </section>
  );
}
