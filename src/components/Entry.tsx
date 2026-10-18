import { type Ref } from "react";
import { IconArrowRight, IconRefresh } from "@tabler/icons-react";
import { Composer, type ComposerProps } from "@/components/rail/Composer";
import { PhotoCheck } from "@/components/work/PhotoCheck";
import { copy } from "@/lib/copy";
import styles from "./Entry.module.css";

type Starter = "derivative" | "geometry";

// The first screen: greeting, the composer, starter problems. With a photo picked, the photo check takes the greeting's place.
// The pet is not here: PetLayer owns the one pet element and parks it by this screen's geometry (see PetLayer.module.css).
export function Entry({
  composer,
  inputRef,
  onStarter,
  onRetry,
  photoCheck,
  leaving = false,
}: {
  composer: Omit<ComposerProps, "inputRef" | "entry">;
  inputRef?: Ref<HTMLTextAreaElement>;
  onStarter: (starter: Starter) => void;
  onRetry?: () => void; // set after a build failed with nothing to show
  photoCheck?: { src: string; onSend: () => void; onRetake: () => void } | null;
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
        <span className={styles.mark} aria-hidden="true">
          D
        </span>
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
          </div>
        )}
      </div>
      <p className={styles.foot}>{copy.entryFoot}</p>
    </section>
  );
}
