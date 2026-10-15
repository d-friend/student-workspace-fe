import { IconArrowRight, IconRefresh } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import styles from "./PhotoCheck.module.css";

// The photo is picked but not sent yet: check it is readable before the agent reads it.
export function PhotoCheck({ src, onSend, onRetake }: { src: string; onSend: () => void; onRetake: () => void }) {
  return (
    <section className={styles.wrap}>
      <figure className={styles.preview}>
        {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL, next/image cannot optimize it */}
        <img src={src} alt={copy.photoAlt} className={styles.image} />
      </figure>
      <div className={styles.text}>
        <h1 className={styles.title}>{copy.photoTitle}</h1>
        <p className={styles.sub}>{copy.photoSub}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onSend}>
            {copy.sendPhoto}
            <IconArrowRight size={20} aria-hidden="true" />
          </button>
          <button type="button" className={styles.secondary} onClick={onRetake}>
            <IconRefresh size={20} aria-hidden="true" />
            {copy.retake}
          </button>
        </div>
      </div>
    </section>
  );
}
