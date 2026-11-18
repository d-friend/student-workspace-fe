import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconArrowRight, IconArrowsShuffle, IconCheck } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import { getSurpriseCard, type ProgressItem, type SurpriseCard } from "@/lib/api";
import { progressDateLabel } from "@/lib/progress";
import { MdInline } from "@/workspace/md";
import styles from "./EmptyThread.module.css";

type Starter = "derivative" | "geometry";

export type EmptyThreadProps = {
  onStarter: (starter: Starter) => void;
  onSurprise: (id?: string) => void;
  progress?: { item: ProgressItem; onOpen: () => void } | null;
};

export function EmptyThread({ onStarter, onSurprise, progress }: EmptyThreadProps) {
  const cards: { id: Starter; title: string; sub: string }[] = [
    { id: "derivative", title: copy.starter1, sub: copy.starter1Sub },
    { id: "geometry", title: copy.starter2, sub: copy.starter2Sub },
  ];
  return (
    <section className={styles.emptyThread}>
      <div className={styles.hello}>
        <h1 className={styles.title}>{copy.entryTitle}</h1>
        <p className={styles.sub}>{copy.entrySub}</p>
      </div>
      <div className={styles.try}>
        {!progress && <>
          <p className={styles.label}>{copy.samplesLabel}</p>
          <div className={styles.cards}>
            {cards.map((c) => (
              <button key={c.id} type="button" className={styles.card} onClick={() => onStarter(c.id)}>
                <span className={styles.cardText}>
                  <span className={styles.cardTitle}>{c.title}</span>
                  <span className={styles.cardSub}>{c.sub}</span>
                </span>
                <IconArrowRight size={20} aria-hidden="true" className={styles.arrow} />
              </button>
            ))}
          </div>
        </>}
        <div className={styles.blocks} data-progress={progress ? "" : undefined}>
          {progress && <NextStep {...progress} />}
          <Surprise onOpen={onSurprise} />
        </div>
      </div>
      <p className={styles.foot}>{copy.entryFoot}</p>
    </section>
  );
}

function NextStep({ item, onOpen }: { item: ProgressItem; onOpen: () => void }) {
  const next = item.next?.[0];
  const continuing = !next && item.steps && !item.steps.done;
  // Some existing next labels already include "Học tiếp:". Keep their wording once.
  const main = next ? (/^(học tiếp|learn next|next)\s*:/i.test(next) ? next : copy.entryLearn + next)
    : continuing ? copy.entryContinue + item.title : item.title;
  return <section className={styles.block} aria-label={copy.entryNext}>
    <div className={styles.blockHead}>
      <h2>{copy.entryNext}</h2>
      <Link className={styles.seeAll} href="/progress">{copy.progressSeeAll}</Link>
    </div>
    <button type="button" className={`${styles.card} ${styles.compactRow}`} onClick={onOpen}>
      <span className={styles.rowText}>
        <span className={styles.nextMain}>
          {!next && !continuing && <IconCheck size={18} className={styles.done} aria-hidden="true" />}
          <span className={styles.ellipsis}><MdInline text={main} /></span>
        </span>
        {next && <span className={`${styles.cardSub} ${styles.ellipsis}`}><MdInline text={item.title} /></span>}
      </span>
      <time className={styles.nextDate} dateTime={item.created_at}>{progressDateLabel(item.created_at)}</time>
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
  if (!state.loading && !state.card) return <button type="button" className={styles.surprise} onClick={() => onOpen()}>{copy.surprise}</button>;
  return <section className={styles.block} aria-label={copy.surpriseHeading} aria-busy={state.loading}>
    <div className={styles.blockHead}>
      <h2>{copy.surpriseHeading}</h2>
    </div>
    {state.loading ? <div className={`${styles.card} ${styles.skeleton}`} role="status" aria-label={copy.surpriseLoading}>
      <span /><span />
    </div> : <div className={styles.surpriseRow}>
      <button type="button" className={`${styles.card} ${styles.compactRow} ${styles.surpriseOpen}`}
        title={state.card!.teaser} onClick={() => onOpen(state.card!.id)}>
        <span className={styles.emoji} aria-hidden="true">{state.card!.emoji}</span>
        <span className={styles.surpriseTitle}><MdInline text={state.card!.title} /></span>
        <IconArrowRight size={20} aria-hidden="true" className={styles.arrow} />
      </button>
      <button type="button" className={styles.shuffle} aria-label={copy.surpriseShuffle}
        onClick={(event) => { event.stopPropagation(); void shuffle(); }}>
        <IconArrowsShuffle size={18} aria-hidden="true" />
      </button>
    </div>}
  </section>;
}
