import { IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { getMapNode, type MapItem, type MapNodeView, type PackBlock } from "@/lib/api";
import { copy } from "@/lib/copy";
import { learnMoreMessage } from "@/lib/pack";
import { track } from "@/lib/track";
import { MdInline } from "@/workspace/md";
import styles from "./Pack.module.css";

// What the student's own notes say about the map node on screen: the summary, the way to its source, and "Học thêm".
// The summary comes with the map; the passages (for the source link and the Học thêm excerpt) are fetched per node.
export function NodePanel({ node, onViewSource, onLearnMore, learnFailed, onClose }: {
  node: MapItem; onViewSource: (blockId: string) => void; onLearnMore: (text: string) => void; learnFailed: boolean; onClose: () => void;
}) {
  const [view, setView] = useState<{ id: string; data: MapNodeView | null; failed: boolean } | null>(null);
  const wanted = node.block_ids.length > 0;

  useEffect(() => {
    if (!wanted) return;
    let active = true;
    getMapNode(node.id).then(
      data => { if (active) setView({ id: node.id, data, failed: false }); },
      () => { if (active) setView({ id: node.id, data: null, failed: true }); },
    );
    return () => { active = false; };
  }, [node.id, wanted]);

  const mine = view?.id === node.id ? view : null;
  const blocks: PackBlock[] = mine?.data?.blocks ?? [];
  const summary = node.summary.trim();
  const hasNotes = summary !== "" || wanted;
  const firstBlock = blocks[0]?.id ?? node.block_ids[0];
  const pack = mine?.data?.pack_ids[0];
  // node_id is the map node's id here, not a global tree node's. The event waits for the fetch that names the pack; the action does not.
  const report = (event: "node_source_viewed" | "learn_more_tapped") => { if (pack) track(event, { node_id: node.id, pack_id: pack }); };

  return <section className={styles.notes} aria-label={copy.packFromNotes}>
    <article className={styles.note}>
      <header className={styles.noteHead}>
        <strong>{node.name}</strong>
        <button type="button" className={styles.close} aria-label={copy.treeClear} onClick={onClose}><IconX size={18} aria-hidden="true" /></button>
      </header>
      {summary !== "" && <p className={styles.summary}><MdInline text={summary} /></p>}
      {!hasNotes && <p className={styles.summary}>{copy.projectNodeEmpty}</p>}
      {mine?.failed && <p className={styles.error} role="alert">{copy.packNodeFailed}</p>}
      {hasNotes && <div className={styles.actions}>
        {firstBlock && <button type="button" className={styles.secondary} onClick={() => {
          report("node_source_viewed");
          onViewSource(firstBlock);
        }}>{copy.packViewSource}</button>}
        <button type="button" className={styles.primary} onClick={() => {
          report("learn_more_tapped");
          onLearnMore(learnMoreMessage(node.name, blocks, summary));
        }}>{copy.packLearnMore}</button>
      </div>}
      {learnFailed && <p className={styles.error} role="alert">{copy.packLearnMoreFailed}</p>}
    </article>
  </section>;
}
