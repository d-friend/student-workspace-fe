import { useId } from "react";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import type { ProgressItem } from "@/lib/api";
import { copy } from "@/lib/copy";
import { progressDateLabel, stoppedAt } from "@/lib/progress";
import { MdInline } from "./md";
import { StagePill } from "./ProgressCard";
import { stageResults } from "./stageResults";
import styles from "./ProgressCardCompact.module.css";

export function ProgressCardCompact({ item, variant, onOpen }: { item: ProgressItem; variant: "entry" | "page"; onOpen: () => void }) {
  const id = useId();
  const title = variant === "entry" && item.roadmap && Object.hasOwn(copy.roadmapTitle, item.roadmap) ? copy.roadmapTitle[item.roadmap] : item.title;
  const names = item.roadmap && Object.hasOwn(copy.roadmaps, item.roadmap) ? copy.roadmaps[item.roadmap] : null;
  const rows = names && item.phase !== "learn" && item.steps ? stageResults(item.stages ?? [], item.steps.entries, item.steps.free) : [];
  const stopped = item.steps && !item.steps.done ? stoppedAt(item) : null;
  const footer = item.next?.[0] ? { label: copy.progressNext, text: item.next[0] }
    : stopped ? { label: copy.progressStopped, text: stopped } : null;

  return <button type="button" className={styles.card} onClick={onOpen} aria-labelledby={`${id}-title${footer ? ` ${id}-footer` : ""}`}>
    <span className={styles.header}>
      <span id={`${id}-title`} className={styles.title}>
        {variant === "entry" && item.steps?.done && <IconCheck className={styles.done} size={18} aria-hidden="true" />}
        <span className={styles.titleText}><MdInline text={title} /></span>
      </span>
      <time className={styles.date} dateTime={item.created_at}>{progressDateLabel(item.created_at)}</time>
    </span>
    {rows.length > 0 && <span className={styles.pills}>
      {rows.map(row => <StagePill key={row.stage} result={row.result} className={styles.mini} firstIcon={false}>
        {names?.[row.stage] ?? ""}{row.result !== "first" && ` · ${row.result === "hint" ? copy.stageHintShort(row.n ?? 0) : row.result === "fixed" ? copy.stageFixedShort(row.n ?? 0) : row.result === "todo" ? copy.stageTodo : copy.stageUnknown}`}
      </StagePill>)}
    </span>}
    {footer && <span id={`${id}-footer`} className={styles.footer}>
      <span><span className={styles.label}>{footer.label.trim()}</span>{" "}{footer.text}</span>
      <IconArrowRight size={20} aria-hidden="true" />
    </span>}
  </button>;
}
