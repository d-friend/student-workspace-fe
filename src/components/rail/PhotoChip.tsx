import { IconX } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import styles from "./PhotoChip.module.css";

// The attached problem photo above the composer. The thumbnail is decorative; the label names it.
export function PhotoChip({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className={styles.chip}>
      {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL, next/image cannot optimize it */}
      <img src={src} alt="" className={styles.thumb} />
      <span className={styles.label}>{copy.photoChip}</span>
      <button type="button" aria-label={copy.removePhoto} className={styles.remove} onClick={onRemove}>
        <IconX size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
