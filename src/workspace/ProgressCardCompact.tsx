import { useId } from "react";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import type { ProgressItem } from "@/lib/api";
import { copy } from "@/lib/copy";
import { stoppedAt } from "@/lib/progress";
import { MdInline } from "./md";
import { StagePill } from "./ProgressCard";
import { stageResults } from "./stageResults";
import styles from "./ProgressCardCompact.module.css";

function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const now = new Date();
  // Like sidebar grouping, compare local calendar days (also across DST), not elapsed hours.
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  const age = day(now) - day(date);
  return age === 0 ? copy.historyToday : age === 1 ? copy.historyYesterday : `${date.getDate()}/${date.getMonth() + 1}`;
}

export function ProgressCardCompact({ item, onOpen }: { item: ProgressItem; onOpen: () => void }) {
  const id = useId();
  const names = item.roadmap && Object.hasOwn(copy.roadmaps, item.roadmap) ? copy.roadmaps[item.roadmap] : null;
  const rows = names && item.phase !== "learn" && item.steps ? stageResults(item.stages ?? [], item.steps.entries, item.steps.free) : [];
  const stopped = item.steps && !item.steps.done ? stoppedAt(item) : null;
  const footer = item.next?.[0] ? { label: copy.progressNext, text: item.next[0] }
    : stopped ? { label: copy.progressStopped, text: stopped } : null;

  return <button type="button" className={styles.card} onClick={onOpen} aria-labelledby={`${id}-title${footer ? ` ${id}-footer` : ""}`}>
    <span className={styles.header}>
      <span id={`${id}-title`} className={styles.title}>
        {item.steps?.done && <IconCheck className={styles.done} size={18} aria-hidden="true" />}
        <span className={styles.titleText}><MdInline text={item.title} /></span>
      </span>
      <time className={styles.date} dateTime={item.created_at}>{dateLabel(item.created_at)}</time>
    </span>
    {rows.length > 0 && <span className={styles.pills}>
      {rows.map(row => <StagePill key={row.stage} result={row.result} className={styles.mini}>{names?.[row.stage] ?? ""}</StagePill>)}
    </span>}
    {footer && <span id={`${id}-footer`} className={styles.footer}>
      <span><span className={styles.label}>{footer.label.trim()}</span>{" "}{footer.text}</span>
      <IconArrowRight size={20} aria-hidden="true" />
    </span>}
  </button>;
}
