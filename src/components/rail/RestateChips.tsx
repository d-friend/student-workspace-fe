import { copy } from "@/lib/copy";
import styles from "./Chips.module.css";

// Shown under the restatement ("Mình đọc đề là: …") until the student answers.
export function RestateChips({ onConfirm, onCorrect }: { onConfirm: () => void; onCorrect: () => void }) {
  return (
    <div className={styles.row}>
      <button type="button" className={`${styles.chip} ${styles.primary}`} onClick={onConfirm}>
        {copy.restateYes}
      </button>
      <button type="button" className={styles.chip} onClick={onCorrect}>
        {copy.restateNo}
      </button>
    </div>
  );
}
