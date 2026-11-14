import { IconArrowRight, IconBulb, IconCheck, IconRefresh } from "@tabler/icons-react";
import { useCopy } from "./WorkspaceCopy";
import { MdInline } from "./md";
import type { StageResult } from "./stageResults";
import styles from "./ProgressCard.module.css";

type Props = {
  hints: number;
  takeaway?: string;
  roadmap?: string;
  rows?: StageResult[];
  offer?: { opts: string[]; onPick: (text: string) => void } | null;
};

export function ProgressCard({ hints, takeaway, roadmap, rows = [], offer }: Props) {
  const copy = useCopy();
  const topic = roadmap && Object.hasOwn(copy.roadmapTitle, roadmap) ? copy.roadmapTitle[roadmap] : undefined;
  const names = roadmap && Object.hasOwn(copy.roadmaps, roadmap) ? copy.roadmaps[roadmap] : undefined;
  const shown = names ? rows : [];
  return (
    <div className={styles.card} role="status">
      <div className={styles.header}>
        <IconCheck size={22} stroke={2} aria-hidden="true" />
        <b className={styles.title}>{copy.doneLabel}</b>
        {topic && <span className={styles.topic}>{topic}</span>}
      </div>
      {shown.length > 0 && <ul className={styles.rows}>
        {shown.map(row => (
          <li key={row.stage} className={styles.row}>
            <div className={styles.line}>
              <span className={styles.stage}><MdInline text={names?.[row.stage] ?? ""} /></span>
              <span className={`${styles.pill} ${styles[row.result]}`}>
                {row.result === "first" && <IconCheck size={14} aria-hidden="true" />}
                {row.result === "hint" && <IconBulb size={14} aria-hidden="true" />}
                {row.result === "fixed" && <IconRefresh size={14} aria-hidden="true" />}
                {row.result === "first" ? copy.stageFirst : row.result === "hint" ? copy.stageHint(row.n ?? 0) : row.result === "fixed" ? copy.stageFixed(row.n ?? 0) : row.result === "todo" ? copy.stageTodo : copy.stageUnknown}
              </span>
            </div>
            {(row.result === "hint" || row.result === "fixed") && row.wrong && <p className={styles.reason}>“<MdInline text={row.wrong} />”</p>}
          </li>
        ))}
      </ul>}
      {takeaway && <p className={styles.takeaway}><MdInline text={copy.takeaway(takeaway)} /></p>}
      {shown.length === 0 && hints > 0 && <p className={styles.hints}>{copy.doneHints(hints)}</p>}
      {!!offer?.opts.length && <div className={styles.buttons}>
        {offer.opts.map((text, i) => <button key={i} type="button" className={`${styles.button} ${i === 0 ? styles.primary : styles.secondary}`} onClick={() => offer.onPick(text)}>
          <span>{text}</span>{i === 0 && <IconArrowRight size={18} aria-hidden="true" />}
        </button>)}
      </div>}
    </div>
  );
}
