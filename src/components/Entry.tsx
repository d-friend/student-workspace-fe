import { type Ref, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { IconArrowRight, IconArrowsShuffle, IconCheck, IconRefresh } from "@tabler/icons-react";
import { Composer, type ComposerProps } from "@/components/rail/Composer";
import { PhotoCheck } from "@/components/work/PhotoCheck";
import { copy } from "@/lib/copy";
import { getSurpriseCard, type ProgressItem, type SurpriseCard } from "@/lib/api";
import { progressDateLabel, stoppedAt } from "@/lib/progress";
import { MdInline } from "@/workspace/md";
import logoMark from "../../assets/logo-mark.png";
import styles from "./Entry.module.css";

type Starter = "derivative" | "geometry";

// The first screen: greeting, the composer, starter problems. With a photo picked, the photo check takes the greeting's place.
// The pet is not here: PetLayer owns the one pet element and parks it by this screen's geometry (see PetLayer.module.css).
export function Entry({
  composer,
  inputRef,
  onStarter,
  onSurprise,
  onRetry,
  photoCheck,
  progress,
  leaving = false,
}: {
  composer: Omit<ComposerProps, "inputRef" | "entry">;
  inputRef?: Ref<HTMLTextAreaElement>;
  onStarter: (starter: Starter) => void;
  onSurprise: (id?: string) => void;
  onRetry?: () => void; // set after a build failed with nothing to show
  photoCheck?: { src: string; onSend: () => void; onRetake: () => void } | null;
  progress?: { item: ProgressItem; onOpen: () => void } | null;
  leaving?: boolean; // the unfold has started: everything fades out and the fly card takes the composer's place
}) {
  const cards: { id: Starter; title: string; sub: string }[] = [
    { id: "derivative", title: copy.starter1, sub: copy.starter1Sub },
    { id: "geometry", title: copy.starter2, sub: copy.starter2Sub },
  ];
  return (
    <section
      className={styles.entry}
      data-photo={photoCheck ? "" : undefined}
      data-leaving={leaving || undefined}
      inert={leaving}
      aria-hidden={leaving || undefined}
    >
      <header className={styles.head}>
        <Image className={styles.mark} src={logoMark} alt="" priority />
        {copy.brand}
      </header>
      {photoCheck && <PhotoCheck {...photoCheck} />}
      <div className={styles.stack}>
        {!photoCheck && (
          <div className={styles.hello}>
            <h1 className={styles.title}>{copy.entryTitle}</h1>
            <p className={styles.sub}>{copy.entrySub}</p>
          </div>
        )}
        <Composer {...composer} inputRef={inputRef} entry />
        {!photoCheck && (
          <div className={styles.try}>
            {onRetry && (
              <button type="button" className={styles.retry} onClick={onRetry}>
                <IconRefresh size={20} aria-hidden="true" />
                {copy.retry}
              </button>
            )}
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
        )}
      </div>
      <p className={styles.foot}>{copy.entryFoot}</p>
    </section>
  );
}

function NextStep({ item, onOpen }: { item: ProgressItem; onOpen: () => void }) {
  const next = item.next?.[0];
  const continuing = !next && item.steps && !item.steps.done;
  const stopped = continuing ? stoppedAt(item) : null;
  // Some existing next labels already include "Học tiếp:". Keep their wording once.
  const main = next ? (/^(học tiếp|learn next|next)\s*:/i.test(next) ? next : copy.entryLearn + next)
    : continuing ? copy.entryContinue + item.title : item.title;
  return <section className={styles.block} aria-label={copy.entryNext}>
    <div className={styles.blockHead}>
      <h2>{copy.entryNext}</h2>
      <Link className={styles.seeAll} href="/progress">{copy.progressSeeAll}</Link>
    </div>
    <div className={styles.nextBody}>
      {next && <span className={styles.nextTitle}><MdInline text={item.title} /></span>}
      <span className={styles.nextMain}>
        {!next && !continuing && <IconCheck size={22} className={styles.done} aria-hidden="true" />}
        <span><MdInline text={main} /></span>
      </span>
      {stopped && <span className={styles.nextTitle}>{copy.progressStopped}{stopped}</span>}
      <time className={styles.nextDate} dateTime={item.created_at}>{progressDateLabel(item.created_at)}</time>
    </div>
    <div className={`${styles.actions} ${styles.nextActions}`}>
      <button type="button" className={styles.primary} onClick={onOpen}>{copy.entryResume}<IconArrowRight size={18} aria-hidden="true" /></button>
    </div>
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
      <h2><IconArrowsShuffle size={20} aria-hidden="true" />{copy.surpriseHeading}</h2>
      {!state.loading && <span className={styles.tag}>{state.card?.tag}</span>}
    </div>
    {state.loading ? <div className={styles.skeleton} role="status" aria-label={copy.surpriseLoading}>
      <span /><span /><span />
    </div> : <>
      <div className={styles.lesson}>
        <span className={styles.emoji} aria-hidden="true">{state.card!.emoji}</span>
        <h3><MdInline text={state.card!.title} /></h3>
        <p title={state.card!.teaser}>{state.card!.teaser}</p>
      </div>
      <div className={`${styles.actions} ${styles.surpriseActions}`}>
        <button type="button" onClick={() => void shuffle()}><IconArrowsShuffle size={18} aria-hidden="true" />{copy.surpriseShuffle}</button>
        <button type="button" className={styles.primary} onClick={() => onOpen(state.card!.id)}>{copy.surpriseExplore}<IconArrowRight size={18} aria-hidden="true" /></button>
      </div>
    </>}
    <p className={styles.surpriseFoot}>{copy.surpriseFoot}</p>
  </section>;
}
