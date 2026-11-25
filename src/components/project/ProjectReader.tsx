import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { PackList } from "@/components/pack/PackList";
import { packPhotoUrl, type PackBlock, type PackSummary, type ReaderPage } from "@/lib/api";
import { copy } from "@/lib/copy";
import { learnMoreMessage } from "@/lib/pack";
import { findBlock, headingAbove, pageNumbers } from "@/lib/projectMap";
import { Md, MdInline } from "@/workspace/md";
import styles from "./Project.module.css";

// "Nguồn": every photo of the project's notes in order, each next to the text read from it. Tapping a passage offers Học thêm.
export function ProjectReader({ projectName, packs, pages, failed, block, onLearnMore, learnFailed }: {
  projectName: string; packs: PackSummary[]; pages: ReaderPage[] | null; failed: boolean; block: string | null; onLearnMore: (text: string) => void; learnFailed: boolean;
}) {
  const hint = useId();
  const [picked, setPicked] = useState<string | null>(null);
  const scrolled = useRef<string | null>(null);
  const numbers = useMemo(() => pageNumbers(pages ?? []), [pages]);

  // "Xem nguồn" lands on the passage it came from. Photos above it load after the first scroll and push it away, so it scrolls again
  // as each photo loads, until the student takes over (any wheel, touch, key or press).
  const moved = useRef(false);
  const land = useCallback(() => {
    if (!block || moved.current) return;
    document.getElementById(`block-${block}`)?.scrollIntoView?.({ block: "center" });
  }, [block]);
  useEffect(() => {
    if (!block) return;
    const stop = () => { moved.current = true; };
    const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    events.forEach(type => document.addEventListener(type, stop, { passive: true, once: true }));
    return () => events.forEach(type => document.removeEventListener(type, stop));
  }, [block]);
  useEffect(() => {
    if (!block || !pages || scrolled.current === block) return;
    scrolled.current = block;
    land();
  }, [block, pages, land]);

  if (failed) return <p className={styles.error} role="alert">{copy.projectSourcesFailed}</p>;
  if (!pages) return null; // ProjectView shows the skeleton until they arrive
  if (!pages.length && !packs.length) return <p className={styles.empty}>{copy.projectSourcesEmpty}</p>;

  const toggle = (id: string) => setPicked(current => current === id ? null : id);
  const onKeyDown = (e: KeyboardEvent, id: string) => {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    toggle(id);
  };
  const learn = (target: PackBlock) => {
    onLearnMore(learnMoreMessage(headingAbove(pages, target.id, projectName), [target], target.text));
  };

  return <div className={styles.reader}>
    <PackList packs={packs} />
    <span id={hint} className={styles.srOnly}>{copy.projectBlockHint}</span>
    {pages.map(page => {
      const n = numbers.get(page.file_id) ?? 0;
      return <section key={page.file_id} className={styles.sheet} aria-label={copy.packPhoto(n)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- an owner-only API route, not an optimizable asset */}
        <img className={styles.photo} src={packPhotoUrl(page.pack_id, page.file_id)} alt={copy.packPhotoAlt(n)} loading={block ? "eager" : "lazy"} onLoad={land} />
        <div className={styles.blocks}>
          {page.blocks.map(b => <div key={b.id} id={`block-${b.id}`} className={styles.block} data-kind={b.kind} data-picked={b.id === picked || undefined}
            data-highlight={b.id === block || undefined} tabIndex={0} aria-describedby={hint} onClick={() => toggle(b.id)} onKeyDown={e => onKeyDown(e, b.id)}>
            {b.kind === "heading" ? <h3><MdInline text={b.text} /></h3> : b.kind === "text" ? <Md text={b.text} /> : <p><MdInline text={b.text} /></p>}
            {b.id === picked && <div className={styles.blockActions}>
              <button type="button" className={styles.primary} onClick={e => { e.stopPropagation(); learn(findBlock(pages, b.id) ?? b); }}>{copy.packLearnMore}</button>
            </div>}
          </div>)}
        </div>
      </section>;
    })}
    {learnFailed && <p className={styles.error} role="alert">{copy.packLearnMoreFailed}</p>}
  </div>;
}
