import { IconBulb } from "@tabler/icons-react";
import { useEffect, useId, useRef } from "react";
import { copy } from "@/lib/copy";
import styles from "./blocks/working.module.css";

export function HelpBar({ level, onHint, onIdea, ideaPending = false }: { level: number; onHint: () => void; onIdea?: () => void; ideaPending?: boolean }) {
  const levelId = useId();
  const ideaRequested = useRef(false);
  useEffect(() => {
    if (!ideaPending) ideaRequested.current = false;
  }, [ideaPending]);
  const requestIdea = () => {
    if (ideaPending || ideaRequested.current) return;
    ideaRequested.current = true;
    onIdea?.();
  };
  return (
    <div className={styles.help}>
      <button type="button" className={styles.hint} aria-describedby={levelId} onClick={onHint}>
        <IconBulb size={20} stroke={2} aria-hidden="true" />
        {copy.hint}
        <span className={styles.ladder} aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= level ? styles.seg + " " + styles.segOn : styles.seg} />
          ))}
        </span>
      </button>
      <span id={levelId} className={styles.srOnly}>
        {copy.hintLevel(level)}
      </span>
      {onIdea && (
        <button type="button" className={styles.idea} disabled={ideaPending} onClick={requestIdea}>
          {copy.idea}
        </button>
      )}
    </div>
  );
}
