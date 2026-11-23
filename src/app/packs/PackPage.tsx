"use client";

import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { SubjectChooser } from "@/components/pack/SubjectChooser";
import { ProfileGate } from "@/components/ProfileGate";
import { usePack } from "@/hooks/usePack";
import { packPhotoUrl, retryPack, setPackSubject, type Pack } from "@/lib/api";
import { copy } from "@/lib/copy";
import { badPages, retryStage } from "@/lib/pack";
import { track } from "@/lib/track";
import { Md, MdInline } from "@/workspace/md";
import styles from "./PackPage.module.css";

const VIA = ["status_sheet", "list", "node_source"] as const;

export function PackPage() {
  const { id } = useParams<{ id: string }>();
  return <ProfileGate><Suspense><PackContent key={id} id={id} /></Suspense></ProfileGate>;
}

// The pack as the student sees it: each photo with the text read from it under it, the concepts it made, and a way to move or retry it.
function PackContent({ id }: { id: string }) {
  const { pack, error, set } = usePack(id);
  const query = useSearchParams();
  const block = query.get("block");
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const scrolled = useRef(false);

  useEffect(() => {
    const via = query.get("via");
    track("pack_opened", { pack_id: id, via: VIA.find(v => v === via) ?? "list" });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- tracked once per pack, not per query change

  // "Xem nguồn" lands on the block it came from.
  useEffect(() => {
    if (!block || !pack || scrolled.current) return;
    const el = document.getElementById(`block-${block}`);
    if (!el) return;
    scrolled.current = true;
    el.scrollIntoView?.({ block: "center" });
  }, [block, pack]);

  const act = async (run: () => Promise<Pack>) => {
    setBusy(true);
    setFailed(false);
    try { set(await run()); setChanging(false); } catch { setFailed(true); } finally { setBusy(false); }
  };

  const back = pack?.project_id
    ? <Link className={styles.back} href={`/projects/${pack.project_id}?tab=sources`}><IconArrowLeft size={18} aria-hidden="true" />{copy.packBackProject}</Link>
    : <Link className={styles.back} href="/progress"><IconArrowLeft size={18} aria-hidden="true" />{copy.packBack}</Link>;
  if (!pack) return <main className={styles.page}>
    {back}
    {error && <p role="alert" className={styles.error}>{error === "missing" ? copy.packNotFound : copy.packLoadFailed}</p>}
  </main>;

  const bad = badPages(pack);
  const settled = pack.status === "ready" || pack.status === "partial" || pack.status === "failed";
  const canRetry = pack.status === "failed" ? pack.error !== "extract:unreadable" : pack.status === "partial" && bad.some(p => p.status === "failed");
  return <main className={styles.page}>
    {back}
    <h1 className={styles.title}>{pack.subject?.name ?? copy.packNoSubject}</h1>
    <p className={styles.meta}><span data-status={pack.status}>{copy.packStatus[pack.status]}</span></p>
    {bad.length > 0 && <ul className={styles.issues}>
      {bad.map(p => <li key={p.n}>{p.status === "unreadable" ? copy.packPhotoBlurry(p.n) : copy.packPhotoFailed(p.n)}</li>)}
    </ul>}
    {failed && <p role="alert" className={styles.error}>{copy.packUploadFailed}</p>}
    {pack.status === "needs_subject" && <SubjectChooser options={pack.guesses ?? copy.packSubjectStandard} busy={busy}
      onChoose={subject => void act(() => setPackSubject(pack.id, subject))} />}
    <div className={styles.actions}>
      {canRetry && <button type="button" className={styles.primary} disabled={busy} onClick={() => {
        track("pack_retry_clicked", { pack_id: pack.id, stage: retryStage(pack) });
        void act(() => retryPack(pack.id));
      }}>{copy.packRetry}</button>}
      {(pack.status === "ready" || pack.status === "partial") && <button type="button" className={styles.secondary} aria-expanded={changing} onClick={() => setChanging(v => !v)}>{copy.packChangeSubject}</button>}
    </div>
    {changing && <SubjectChooser options={copy.packSubjectStandard.filter(s => s !== pack.subject?.name)} busy={busy}
      onChoose={subject => void act(() => setPackSubject(pack.id, subject))} />}

    {settled && pack.nodes.length > 0 && <section aria-labelledby="pack-concepts">
      <h2 id="pack-concepts" className={styles.h2}>{copy.packConcepts}</h2>
      <ul className={styles.concepts}>
        {pack.nodes.map(n => <li key={n.id}><strong>{n.name}</strong></li>)}
      </ul>
    </section>}

    {pack.files.map((file, i) => <section key={file.id} className={styles.page1} aria-label={copy.packPhoto(i + 1)}>
      <h2 className={styles.h2}>{copy.packPhoto(i + 1)}</h2>
      {/* eslint-disable-next-line @next/next/no-img-element -- an owner-only API route, not an optimizable asset */}
      <img className={styles.photo} src={packPhotoUrl(pack.id, file.id)} alt={copy.packPhotoAlt(i + 1)} loading="lazy" />
      <div className={styles.blocks} aria-label={copy.packBlocks}>
        {pack.blocks.filter(b => b.file_id === file.id).map(b => <div key={b.id} id={`block-${b.id}`} className={styles.block} data-kind={b.kind} data-highlight={b.id === block || undefined}>
          {b.kind === "heading" ? <h3><MdInline text={b.text} /></h3> : b.kind === "text" ? <Md text={b.text} /> : <p><MdInline text={b.text} /></p>}
        </div>)}
      </div>
    </section>)}
  </main>;
}
