import { IconArrowRight, IconBulb, IconCheck, IconRefresh } from "@tabler/icons-react";
import { Fragment, type ReactNode } from "react";
import type { QueueItem } from "@/lib/api";
import { QueueStatusIcon } from "./PhaseSwitch";
import { useCopy } from "./WorkspaceCopy";
import { MdInline } from "./md";
import type { StageResult } from "./stageResults";
import styles from "./ProgressCard.module.css";

type Props = {
  hints: number;
  takeaway?: string;
  roadmap?: string;
  rows?: StageResult[];
  parts?: { label: string; roadmap?: string; rows: StageResult[] }[]; // a multi-part problem: stage rows per part
  offer?: { opts: string[]; onPick: (text: string) => void } | null;
  next?: { item: QueueItem; onOpen: () => void } | null; // the page's next problem, in the offer's place
};

export function StagePill({ result, children, className = "", firstIcon = true }: { result: StageResult["result"]; children: ReactNode; className?: string; firstIcon?: boolean }) {
  return <span className={`${styles.pill} ${styles[result]} ${className}`}>
    {result === "first" && firstIcon && <IconCheck size={14} aria-hidden="true" />}
    {result === "hint" && <IconBulb size={14} aria-hidden="true" />}
    {result === "fixed" && <IconRefresh size={14} aria-hidden="true" />}
    {children}
  </span>;
}

export function ProgressCard({ hints, takeaway, roadmap, rows = [], parts, offer, next }: Props) {
  const copy = useCopy();
  const topic = roadmap && Object.hasOwn(copy.roadmapTitle, roadmap) ? copy.roadmapTitle[roadmap] : undefined;
  const sections = (parts ?? [{ label: undefined, roadmap, rows }]).flatMap((part) => {
    const names = part.roadmap && Object.hasOwn(copy.roadmaps, part.roadmap) ? copy.roadmaps[part.roadmap] : undefined;
    return names && part.rows.length > 0 ? [{ ...part, names }] : [];
  });
  return (
    <div className={styles.card} role="status">
      <div className={styles.header}>
        <IconCheck size={22} stroke={2} aria-hidden="true" />
        <b className={styles.title}>{copy.doneLabel}</b>
        {topic && <span className={styles.topic}>{topic}</span>}
      </div>
      {sections.map(({ label, names, rows }) => <Fragment key={label ?? ""}>
        {label && <h3 className={styles.part}><MdInline text={label} /></h3>}
        <ul className={styles.rows}>
          {rows.map(row => (
            <li key={row.stage} className={styles.row}>
              <div className={styles.line}>
                <span className={styles.stage}><MdInline text={names[row.stage] ?? ""} /></span>
                <StagePill result={row.result}>
                  {row.result === "first" ? copy.stageFirst : row.result === "hint" ? copy.stageHint(row.n ?? 0) : row.result === "fixed" ? copy.stageFixed(row.n ?? 0) : row.result === "todo" ? copy.stageTodo : copy.stageUnknown}
                </StagePill>
              </div>
              {(row.result === "hint" || row.result === "fixed") && row.wrong && <p className={styles.reason}>“<MdInline text={row.wrong} />”</p>}
            </li>
          ))}
        </ul>
      </Fragment>)}
      {takeaway && <p className={styles.takeaway}><b>{copy.takeawayLabel}</b>{" "}<MdInline text={takeaway} /></p>}
      {sections.length === 0 && hints > 0 && <p className={styles.hints}>{copy.doneHints(hints)}</p>}
      {next && <div className={styles.buttons}>
        <button type="button" className={`${styles.button} ${styles.primary} ${styles.next}`} onClick={next.onOpen}>
          <span className={styles.nextText}>
            <span>{copy.queueNext(next.item.label)}</span>
            <span className={styles.nextStatus}><QueueStatusIcon status={next.item.status} size={16} />{copy.queueStatus[next.item.status]}</span>
          </span>
          <IconArrowRight size={18} aria-hidden="true" />
        </button>
      </div>}
      {!next && !!offer?.opts.length && <div className={styles.buttons}>
        {offer.opts.map((text, i) => <button key={i} type="button" className={`${styles.button} ${i === 0 ? styles.primary : styles.secondary}`} onClick={() => offer.onPick(text)}>
          <span>{text}</span>{i === 0 && <IconArrowRight size={18} aria-hidden="true" />}
        </button>)}
      </div>}
    </div>
  );
}
