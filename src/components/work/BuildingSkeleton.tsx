import { copy } from "@/lib/copy";
import styles from "./BuildingSkeleton.module.css";

// Grey shapes in the shape of the doc being built: learn is a title, text and an image; solve (also practice) is a
// problem card and step rows.
export function BuildingSkeleton({
  variant = "solve",
  problem,
}: {
  variant?: "learn" | "solve";
  problem?: string; // what the student sent: the unfold's card lands here, so it must not turn into grey bars
}) {
  const b = (cls: string) => <span className={`${styles.block} ${cls}`} />;
  return (
    <section className={styles.wrap} aria-busy="true" data-variant={variant}>
      {variant === "learn" ? (
        <div className={styles.stack} data-unfold-target="">
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
        <div className={styles.stack} data-unfold-target="">
          <div className={styles.card}>
            {problem ? (
              <>
                <h2 className={styles.problemLabel}>{copy.problemLabel}</h2>
                <p className={styles.problem}>{problem}</p>
              </>
            ) : (
              <>
                {b(styles.label)}
                {b(styles.line)}
                {b(styles.lineShort)}
              </>
            )}
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
