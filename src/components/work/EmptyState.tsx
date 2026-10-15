import { IconArrowRight, IconCamera, IconPencil } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import styles from "./EmptyState.module.css";

export function EmptyState({
  onSnap,
  onType,
  onStarter,
}: {
  onSnap: () => void;
  onType: () => void;
  onStarter: (starter: "derivative" | "geometry") => void;
}) {
  return (
    <section className={styles.wrap}>
      <div className={styles.intro}>
        <h1 className={styles.title}>{copy.emptyTitle}</h1>
        <p className={styles.sub}>{copy.emptySub}</p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onSnap}>
          <IconCamera size={22} aria-hidden="true" />
          {copy.snap}
        </button>
        <button type="button" className={styles.secondary} onClick={onType}>
          <IconPencil size={20} aria-hidden="true" />
          {copy.typeProblem}
        </button>
      </div>
      <div className={styles.samples}>
        <span className={styles.samplesLabel}>{copy.samplesLabel}</span>
        <div className={styles.list}>
          <button type="button" className={styles.sample} onClick={() => onStarter("derivative")}>
            <span className={styles.sampleText}>
              <span className={styles.sampleTitle}>{copy.starter1}</span>
              <span className={styles.sampleSub}>{copy.starter1Sub}</span>
            </span>
            <IconArrowRight size={20} aria-hidden="true" className={styles.arrow} />
          </button>
          <button type="button" className={styles.sample} onClick={() => onStarter("geometry")}>
            <span className={styles.sampleText}>
              <span className={styles.sampleTitle}>{copy.starter2}</span>
              <span className={styles.sampleSub}>{copy.starter2Sub}</span>
            </span>
            <IconArrowRight size={20} aria-hidden="true" className={styles.arrow} />
          </button>
        </div>
      </div>
    </section>
  );
}
