import Link from "next/link";
import { useId } from "react";
import type { PackSummary } from "@/lib/api";
import { copy } from "@/lib/copy";
import { progressDateLabel } from "@/lib/progress";
import styles from "./Pack.module.css";

// "Vở đã tải": the packs of the subject on screen (or all of them), newest first, each reopens its page.
export function PackList({ packs }: { packs: PackSummary[] }) {
  const id = useId();
  if (!packs.length) return null;
  return <section aria-labelledby={id}>
    <h2 id={id} className={styles.listTitle}>{copy.packListTitle}</h2>
    <div className={styles.list}>
      {packs.map(pack => <Link key={pack.id} className={styles.row} href={`/packs/${pack.id}?via=list`}>
        <span className={styles.rowTitle}>{pack.subject?.name ?? copy.packNoSubject}</span>
        <span className={styles.rowMeta}>
          <span>{copy.packListMeta(pack.photos ?? 0, pack.concepts ?? 0)}</span>
          <span className={styles.badge} data-status={pack.status}>{copy.packStatus[pack.status]}</span>
          <time dateTime={pack.created_at}>{progressDateLabel(pack.created_at)}</time>
        </span>
      </Link>)}
    </div>
  </section>;
}
