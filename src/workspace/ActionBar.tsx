import { IconBulb } from "@tabler/icons-react";
import { useEffect, useId, useRef } from "react";
import { useCopy } from "./WorkspaceCopy";
import styles from "./blocks/working.module.css";

export function ActionBar({ level, onHint, onIdea, ideaPending = false, onExplainStep, onOtherWay, sticky = false }: { level: number; onHint: () => void; onIdea?: () => void; ideaPending?: boolean; onExplainStep?: () => void; onOtherWay?: () => void; sticky?: boolean }) {
  const copy = useCopy();
  const levelId = useId();
  // Idea and explain-step both wake the master, so they share one in-flight guard.
  const requested = useRef(false);
  useEffect(() => {
    if (!ideaPending) requested.current = false;
  }, [ideaPending]);
  const request = (send?: () => void) => () => {
    if (ideaPending || requested.current) return;
    requested.current = true;
    send?.();
  };
  return (
    <div className={`${styles.help} ${sticky ? styles.actionBar : ""}`} data-action-bar>
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
        <button type="button" className={styles.idea} aria-label={copy.idea} disabled={ideaPending} onClick={request(onIdea)}>
          <span className={styles.longLabel}>{copy.idea}</span><span className={styles.shortLabel} aria-hidden="true">{copy.ideaShort}</span>
        </button>
      )}
      {onExplainStep && (
        <button type="button" className={styles.otherWay} aria-label={copy.explainStep} disabled={ideaPending} onClick={request(onExplainStep)}>
          <span className={styles.longLabel}>{copy.explainStep}</span><span className={styles.shortLabel} aria-hidden="true">{copy.explainStepShort}</span>
        </button>
      )}
      {onOtherWay && <button type="button" className={styles.otherWay} aria-label={copy.otherWay} onClick={onOtherWay}><span className={styles.longLabel}>{copy.otherWay}</span><span className={styles.shortLabel} aria-hidden="true">{copy.otherWayShort}</span></button>}
    </div>
  );
}
