import Link from "next/link";
import { useEffect, useState } from "react";
import { getNodeView, type NodeView, type TreeNode } from "@/lib/api";
import { copy } from "@/lib/copy";
import { learnMoreMessage } from "@/lib/pack";
import { progressDateLabel } from "@/lib/progress";
import { track } from "@/lib/track";
import { MdInline } from "@/workspace/md";
import styles from "./Pack.module.css";

// What the student's own notes say about the node on screen: the summary, the way to its source, and "Học thêm".
export function NodePanel({ node, onLearnMore, learnFailed }: { node: TreeNode; onLearnMore: (text: string) => void; learnFailed: boolean }) {
  const [view, setView] = useState<{ id: string; data: NodeView | null; failed: boolean } | null>(null);
  const wanted = node.packs > 0;

  useEffect(() => {
    if (!wanted) return;
    let active = true;
    getNodeView(node.id).then(
      data => { if (active) setView({ id: node.id, data, failed: false }); },
      () => { if (active) setView({ id: node.id, data: null, failed: true }); },
    );
    return () => { active = false; };
  }, [node.id, wanted]);

  const mine = view?.id === node.id ? view : null;
  if (!wanted || !mine) return null;
  if (mine.failed) return <p className={styles.error} role="alert">{copy.packNodeFailed}</p>;
  const summaries = mine.data?.summaries ?? [];
  if (!summaries.length) return null;
  return <section className={styles.notes} aria-label={copy.packFromNotes}>
    {summaries.map(s => <article key={s.pack_id} className={styles.note}>
      <header className={styles.noteHead}><strong>{copy.packFromNotes}</strong><time dateTime={s.created_at}>{progressDateLabel(s.created_at)}</time></header>
      <p className={styles.summary}><MdInline text={s.summary} /></p>
      <div className={styles.actions}>
        <Link className={styles.secondary} href={`/packs/${s.pack_id}?via=node_source${s.blocks[0] ? `&block=${s.blocks[0].id}` : ""}`}
          onClick={() => track("node_source_viewed", { node_id: node.id, pack_id: s.pack_id })}>{copy.packViewSource}</Link>
        <button type="button" className={styles.primary} onClick={() => {
          track("learn_more_tapped", { node_id: node.id, pack_id: s.pack_id });
          onLearnMore(learnMoreMessage(node.name, s.blocks, s.summary));
        }}>{copy.packLearnMore}</button>
      </div>
    </article>)}
    {learnFailed && <p className={styles.error} role="alert">{copy.packLearnMoreFailed}</p>}
  </section>;
}
