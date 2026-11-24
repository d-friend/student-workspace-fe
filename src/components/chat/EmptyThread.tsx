import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconArrowRight, IconArrowsShuffle, IconCheck, IconPhotoPlus } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import { PackUpload } from "@/components/pack/PackUpload";
import { getSurpriseCard, type Pack, type ProgressItem, type SurpriseCard } from "@/lib/api";
import { progressDateLabel } from "@/lib/progress";
import { MdInline } from "@/workspace/md";
import styles from "./EmptyThread.module.css";

type Starter = "derivative" | "geometry";

export type EmptyThreadProps = {
  onStarter: (starter: Starter) => void;
  onSurprise: (id?: string) => void;
  progress?: { item: ProgressItem; onOpen: () => void } | null;
  onPackUploaded?: (pack: Pack) => void; // "Tải vở / sách": the page owns the status sheet
  review?: { due: number; projectId: string } | null; // cards due today across subjects; the chip opens the one with the most
};

// Three cards of one size and style: a next step (or, with no progress yet, one sample), a surprise, and the notes upload.
// Each is label on top, content, and an arrow: the card is the action.
export function EmptyThread({ onStarter, onSurprise, progress, onPackUploaded, review }: EmptyThreadProps) {
  return (
    <section className={styles.emptyThread}>
      <div className={styles.hello}>
        <h1 className={styles.title}>{copy.entryTitle}</h1>
        <p className={styles.sub}>{copy.entrySub}</p>
      </div>
      {review && review.due > 0 && <Link className={styles.chip} href={`/projects/${review.projectId}?tab=review&via=home_chip`}>{copy.homeReviewChip(review.due)}</Link>}
      <div className={styles.tiles}>
        {progress ? <NextStep {...progress} /> : <Sample onOpen={() => onStarter("derivative")} />}
        <Surprise onOpen={onSurprise} />
        {onPackUploaded && <PackUpload onUploaded={onPackUploaded} card={{
          className: styles.tile, cellClassName: styles.cell,
          children: busy => <>
            <span className={styles.label}>{copy.packUpload}</span>
            <span className={styles.main}>
              <IconPhotoPlus size={24} aria-hidden="true" className={styles.lead} />
              <span className={`${styles.text} ${styles.name}`}>{busy ? copy.packUploading : copy.homeUploadHint}</span>
              <IconArrowRight size={20} aria-hidden="true" className={styles.arrow} />
            </span>
          </>,
        }} />}
      </div>
      <p className={styles.foot}>{copy.entryFoot}</p>
    </section>
  );
}

function Sample({ onOpen }: { onOpen: () => void }) {
  return <section className={styles.tile} aria-label={copy.samplesLabel}>
    <div className={styles.head}><h2>{copy.samplesLabel}</h2></div>
    <button type="button" className={styles.main} onClick={onOpen}>
      <span className={styles.text}>
        <span className={styles.name}>{copy.starter1}</span>
        <span className={styles.meta}>{copy.starter1Sub}</span>
      </span>
      <IconArrowRight size={20} aria-hidden="true" className={styles.arrow} />
    </button>
  </section>;
}

function NextStep({ item, onOpen }: { item: ProgressItem; onOpen: () => void }) {
  const next = item.next?.[0];
  const continuing = !next && item.steps && !item.steps.done;
  // Some existing next labels already include "Học tiếp:". Keep their wording once.
  const main = next ? (/^(học tiếp|learn next|next)\s*:/i.test(next) ? next : copy.entryLearn + next)
    : continuing ? copy.entryContinue + item.title : item.title;
  return <section className={styles.tile} aria-label={copy.entryNext}>
    <div className={styles.head}>
      <h2>{copy.entryNext}</h2>
      <Link className={styles.corner} href="/progress">{copy.progressSeeAll}</Link>
    </div>
    <button type="button" className={styles.main} onClick={onOpen}>
      <span className={styles.text}>
        <span className={styles.nextMain}>
          {!next && !continuing && <IconCheck size={18} className={styles.done} aria-hidden="true" />}
          <span className={styles.name}><MdInline text={main} /></span>
        </span>
        <span className={styles.metaRow}>
          {next && <span className={`${styles.meta} ${styles.ellipsis}`}><MdInline text={item.title} /></span>}
          <time className={`${styles.meta} ${styles.date}`} dateTime={item.created_at}>{progressDateLabel(item.created_at)}</time>
        </span>
      </span>
      <IconArrowRight size={20} aria-hidden="true" className={styles.arrow} />
    </button>
  </section>;
}

function Surprise({ onOpen }: { onOpen: (id?: string) => void }) {
  const [state, setState] = useState<{ card: SurpriseCard | null; loading: boolean }>({ card: null, loading: true });
  const request = useRef<Promise<SurpriseCard> | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    // Retain the first request across StrictMode's effect replay.
    request.current ??= getSurpriseCard();
    void request.current.then(card => {
      if (mounted.current) setState({ card, loading: false });
    }, () => {
      if (mounted.current) setState({ card: null, loading: false });
    });
    return () => { mounted.current = false; };
  }, []);
  const shuffle = async () => {
    if (inFlight.current || state.loading) return;
    inFlight.current = true;
    setState(current => ({ ...current, loading: true }));
    try {
      const card = await getSurpriseCard(state.card?.id);
      if (mounted.current) setState({ card, loading: false });
    } catch {
      if (mounted.current) setState({ card: null, loading: false });
    } finally {
      inFlight.current = false;
    }
  };
  if (!state.loading && !state.card) return <section className={styles.tile} aria-label={copy.surpriseHeading}>
    <div className={styles.head}><h2>{copy.surpriseHeading}</h2></div>
    <button type="button" className={styles.main} onClick={() => onOpen()}>
      <span className={styles.text}><span className={styles.name}>{copy.surprise}</span></span>
      <IconArrowRight size={20} aria-hidden="true" className={styles.arrow} />
    </button>
  </section>;
  return <section className={styles.tile} aria-label={copy.surpriseHeading} aria-busy={state.loading}>
    <div className={styles.head}>
      <h2>{copy.surpriseHeading}</h2>
      {!state.loading && <button type="button" className={styles.corner} aria-label={copy.surpriseShuffle}
        onClick={(event) => { event.stopPropagation(); void shuffle(); }}>
        <IconArrowsShuffle size={18} aria-hidden="true" />
      </button>}
    </div>
    {state.loading ? <div className={`${styles.main} ${styles.skeleton}`} role="status" aria-label={copy.surpriseLoading}>
      <span /><span />
    </div> : <button type="button" className={styles.main} title={state.card!.teaser} onClick={() => onOpen(state.card!.id)}>
      <span className={styles.emoji} aria-hidden="true">{state.card!.emoji}</span>
      <span className={styles.text}><span className={styles.name}><MdInline text={state.card!.title} /></span></span>
      <IconArrowRight size={20} aria-hidden="true" className={styles.arrow} />
    </button>}
  </section>;
}
