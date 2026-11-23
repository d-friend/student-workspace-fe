import Link from "next/link";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { usePack } from "@/hooks/usePack";
import { retryPack, setPackSubject, type Pack } from "@/lib/api";
import { copy } from "@/lib/copy";
import { badPages, packStage, retryStage } from "@/lib/pack";
import { track } from "@/lib/track";
import { SubjectChooser } from "./SubjectChooser";
import styles from "./Pack.module.css";

// The status of a pack just uploaded: reading photos (2/5), finding the subject, updating the tree, done. Closing it leaves the pack running.
export function PackSheet({ initial, onClose, onSettled }: { initial: Pack; onClose: () => void; onSettled: () => void }) {
  const { pack, set } = usePack(initial.id, initial);
  const current = pack ?? initial;
  const stage = packStage(current);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const settled = useRef(false);
  const done = stage === "ready" || stage === "partial" || stage === "failed";

  useEffect(() => { dialog.current?.focus(); }, []);
  useEffect(() => {
    if (!done || settled.current) return;
    settled.current = true;
    onSettled();
  }, [done, onSettled]);

  const act = async (run: () => Promise<Pack>) => {
    setBusy(true);
    setFailed(false);
    try { set(await run()); settled.current = false; } catch { setFailed(true); } finally { setBusy(false); }
  };
  const retry = () => {
    track("pack_retry_clicked", { pack_id: current.id, stage: retryStage(current) });
    void act(() => retryPack(current.id));
  };
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };

  const bad = badPages(current);
  const total = current.files.length;
  const created = current.nodes.filter(n => n.created).length;
  const line =
    stage === "reading" ? copy.packReading(current.files.filter(f => f.status !== "pending").length, total)
    : stage === "subject" ? copy.packFindingSubject
    : stage === "merging" ? copy.packMerging
    : stage === "needs_subject" ? copy.packAskSubject
    : stage === "ready" ? copy.packDone(created, current.nodes.length - created)
    : stage === "partial" ? copy.packDonePartial(bad.length)
    : current.error === "extract:unreadable" ? copy.packFailedNoText : copy.packFailed;
  const canRetry = stage === "failed" ? current.error !== "extract:unreadable" : stage === "partial" && bad.some(p => p.status === "failed");

  return <div className={styles.backdrop} onKeyDown={onKeyDown}>
    <section ref={dialog} tabIndex={-1} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="pack-sheet-title">
      <h2 id="pack-sheet-title" className={styles.sheetTitle}>{copy.packSheetTitle}</h2>
      <p className={styles.status} role="status" aria-live="polite" data-stage={stage}>{stage === "needs_subject" ? null : line}</p>
      {!done && stage !== "needs_subject" && <div className={styles.bar} aria-hidden="true"><span /></div>}
      {stage === "needs_subject" && <SubjectChooser options={current.guesses ?? copy.packSubjectStandard}
        busy={busy} onChoose={subject => void act(() => setPackSubject(current.id, subject))} />}
      {bad.length > 0 && <ul className={styles.issues}>
        {bad.map(p => <li key={p.n}>{p.status === "unreadable" ? copy.packPhotoBlurry(p.n) : copy.packPhotoFailed(p.n)}</li>)}
      </ul>}
      {failed && <p className={styles.error} role="alert">{copy.packUploadFailed}</p>}
      <div className={styles.actions}>
        {canRetry && <button type="button" className={styles.primary} disabled={busy} onClick={retry}>{copy.packRetry}</button>}
        {(stage === "ready" || stage === "partial") && (current.project_id
          ? <Link className={styles.primary} href={`/projects/${current.project_id}`}
            onClick={() => track("project_opened", { project_id: current.project_id!, via: "pack_sheet" })}>{copy.packOpenProject}</Link>
          : <Link className={styles.primary} href={`/packs/${current.id}?via=status_sheet`}>{copy.packOpen}</Link>)}
        <button type="button" className={styles.secondary} onClick={onClose}>{copy.packClose}</button>
      </div>
    </section>
  </div>;
}
