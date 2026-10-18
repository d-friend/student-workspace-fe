import type { ReactNode } from "react";
import { IconLoader2, IconX } from "@tabler/icons-react";
import type { Bubble } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";
import styles from "./PetBubble.module.css";

export type SpokenBubble = Extract<Bubble, { kind: "agent" | "error" | "note" }>;

// What D-Friend said this turn, next to the pet, one paragraph per message. `status` is the build's progress, shown
// under the words. `children` are the chips that apply to the last message.
export function PetBubble({
  bubbles,
  status,
  onClose,
  onReply,
  children,
}: {
  bubbles: SpokenBubble[];
  status: string | null;
  onClose: () => void;
  onReply: () => void;
  children?: ReactNode;
}) {
  const last = bubbles.at(-1);
  const waiting = last?.kind === "agent" && last.waiting;
  const error = last?.kind === "error";
  return (
    <div role={error ? "alert" : "status"} className={`${styles.bubble} ${error ? styles.error : ""}`}>
      <div className={styles.row}>
        <div className={styles.texts}>
          {bubbles.map(
            (b) =>
              !(b.kind === "agent" && b.waiting) && (
                // Keyed on the bubble, not its text, so streaming words land in place and textIn plays once.
                <p key={b.id} className={styles.text}>
                  {b.kind === "agent" && b.line !== null && (
                    <span className={styles.line}>{copy.reviewLabel(b.line)}</span>
                  )}
                  {b.text}
                </p>
              ),
          )}
          {status !== null ? (
            <p className={styles.status}>
              <IconLoader2 size={16} aria-hidden="true" className={styles.spin} />
              {status}
            </p>
          ) : (
            waiting && (
              <span className={styles.dots} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            )
          )}
        </div>
        <button type="button" className={styles.close} aria-label={copy.bubbleClose} onClick={onClose}>
          <span className={styles.closeDisc}>
            <IconX size={16} aria-hidden="true" />
          </span>
        </button>
      </div>
      {!waiting && children}
      {last && !waiting && (
        <button type="button" className={styles.reply} onClick={onReply}>
          {copy.reply}
        </button>
      )}
    </div>
  );
}
