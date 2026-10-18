import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import type { Bubble } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";
import styles from "./PetBubble.module.css";

export type SpokenBubble = Extract<Bubble, { kind: "agent" | "error" | "note" }>;

// The latest thing D-Friend said, next to the pet. `children` are the chips that apply to it.
export function PetBubble({
  bubble,
  onClose,
  onReply,
  children,
}: {
  bubble: SpokenBubble;
  onClose: () => void;
  onReply: () => void;
  children?: ReactNode;
}) {
  const waiting = bubble.kind === "agent" && bubble.waiting;
  const error = bubble.kind === "error";
  return (
    <div role={error ? "alert" : "status"} className={`${styles.bubble} ${error ? styles.error : ""}`}>
      <div className={styles.row}>
        {waiting ? (
          <span className={styles.dots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : (
          // Re-keyed on the text, so textIn replays when the dots turn into words.
          <p key={bubble.text} className={styles.text}>
            {bubble.kind === "agent" && bubble.line !== null && (
              <span className={styles.line}>{copy.reviewLabel(bubble.line)}</span>
            )}
            {bubble.text}
          </p>
        )}
        <button type="button" className={styles.close} aria-label={copy.bubbleClose} onClick={onClose}>
          <span className={styles.closeDisc}>
            <IconX size={16} aria-hidden="true" />
          </span>
        </button>
      </div>
      {!waiting && children}
      {!waiting && (
        <button type="button" className={styles.reply} onClick={onReply}>
          {copy.reply}
        </button>
      )}
    </div>
  );
}
