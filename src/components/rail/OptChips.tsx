import { copy } from "@/lib/copy";
import styles from "./Chips.module.css";

// The agent's answer choices; the bubble adds "Tự nhắn" (onWriteOwn) to type a reply instead.
export function OptChips({
  options,
  onPick,
  onWriteOwn,
}: {
  options: string[];
  onPick: (text: string) => void;
  onWriteOwn?: () => void;
}) {
  return (
    <div className={styles.row}>
      {options.map((o, i) => (
        <button key={o} type="button" className={`${styles.chip} ${i === 0 ? styles.primary : ""}`} onClick={() => onPick(o)}>
          {o}
        </button>
      ))}
      {onWriteOwn && (
        <button type="button" className={styles.chip} onClick={onWriteOwn}>
          {copy.writeOwn}
        </button>
      )}
    </div>
  );
}
