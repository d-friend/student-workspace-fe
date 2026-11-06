import { IconCheck } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import styles from "./blocks/working.module.css";

export function DoneBanner({ hints, takeaway, roadmap }: { hints: number; takeaway?: string; roadmap?: string }) {
  const topic = roadmap && Object.hasOwn(copy.roadmapTitle, roadmap) ? copy.roadmapTitle[roadmap] : undefined;
  return (
    <div className={styles.done} role="status">
      <div className={styles.doneMain}>
        <IconCheck size={20} stroke={2} aria-hidden="true" />
        <b>{copy.doneLabel}</b>
      </div>
      {takeaway && <p className={styles.doneTakeaway}>{copy.takeaway(takeaway)} {topic && <span className={styles.doneTopic}>{topic}</span>}</p>}
      {hints > 0 && <p className={styles.doneHints}>{copy.doneHints(hints)}</p>}
    </div>
  );
}
