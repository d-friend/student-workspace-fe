import { copy } from "@/lib/copy";
import styles from "./Chips.module.css";

// Shown under an [offer] message: try a similar problem, or not now.
export function OfferChips({ onAccept, onLater }: { onAccept: () => void; onLater: () => void }) {
  return (
    <div className={styles.row}>
      <button type="button" className={`${styles.chip} ${styles.primary}`} onClick={onAccept}>
        {copy.offerYes}
      </button>
      <button type="button" className={styles.chip} onClick={onLater}>
        {copy.offerLater}
      </button>
    </div>
  );
}
