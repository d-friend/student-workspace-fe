import { copy } from "@/lib/copy";
import { StatusPill } from "./StatusPill";
import styles from "./BuildingSkeleton.module.css";

// Grey shapes in the shape of the doc being built: learn is a title, text and an image; solve (also practice) is a
// problem card and step rows.
export function BuildingSkeleton({ status = copy.thinking, variant = "solve" }: { status?: string; variant?: "learn" | "solve" }) {
  const b = (cls: string) => <span className={`${styles.block} ${cls}`} />;
  return (
    <section className={styles.wrap} aria-busy="true" data-variant={variant}>
      <StatusPill>{status}</StatusPill>
      {variant === "learn" ? (
        <div className={styles.stack}>
          {b(styles.title)}
          <div className={styles.lines}>
            {b(styles.line)}
            {b(styles.line)}
            {b(styles.line)}
            {b(styles.lineShort)}
          </div>
          {b(styles.box)}
        </div>
      ) : (
        <div className={styles.stack}>
          <div className={styles.card}>
            {b(styles.label)}
            {b(styles.line)}
            {b(styles.lineShort)}
          </div>
          <div className={styles.card}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.entry}>
                {b(styles.num)}
                {b(styles.input)}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
