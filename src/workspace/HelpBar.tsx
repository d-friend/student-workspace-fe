import { IconBulb } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import styles from "./blocks/working.module.css";

export function HelpBar({ level, onHint, onIdea }: { level: number; onHint: () => void; onIdea?: () => void }) {
  return (
    <div className={styles.help}>
      <button type="button" className={styles.hint} onClick={onHint}>
        <IconBulb size={20} stroke={2} aria-hidden="true" />
        {copy.hint}
        <span className={styles.ladder} aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= level ? styles.seg + " " + styles.segOn : styles.seg} />
          ))}
        </span>
      </button>
      {onIdea && (
        <button type="button" className={styles.idea} onClick={onIdea}>
          {copy.idea}
        </button>
      )}
    </div>
  );
}
