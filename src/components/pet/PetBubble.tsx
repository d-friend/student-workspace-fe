import { type ReactNode, useEffect, useRef, useState } from "react";
import { IconLoader2, IconX } from "@tabler/icons-react";
import type { Bubble } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";
import styles from "./PetBubble.module.css";

export type SpokenBubble = Extract<Bubble, { kind: "agent" | "error" | "note" }>;

const SHOW_MS = 8000; // how long a finished message stays before it fades
const FADE_MS = 400; // keep in step with bubbleOut in PetBubble.module.css

// What D-Friend said this turn, next to the pet, one paragraph per message. `status` is the build's progress, shown
// under the words. `children` are the chips that apply to the last message. With `autoHide`, a finished message
// fades away after SHOW_MS and calls `onHide`; an error, a message still being written, a build in progress, and a
// bubble the student is pointing at or has focus in all stay (the caller turns it off for a bubble with choices). The words keep streaming in place, and each change
// restarts the clock.
export function PetBubble({
  bubbles,
  status,
  onClose,
  autoHide,
  onHide,
  children,
}: {
  bubbles: SpokenBubble[];
  status: string | null;
  onClose: () => void;
  autoHide: boolean;
  onHide: () => void;
  children?: ReactNode;
}) {
  const last = bubbles.at(-1);
  const waiting = last?.kind === "agent" && last.waiting;
  const error = last?.kind === "error";

  const [held, setHeld] = useState(false); // pointer over it, or focus inside it
  const [fadedContent, setFadedContent] = useState<string | null>(null); // the content whose clock ran out
  const hide = useRef(onHide);
  useEffect(() => {
    hide.current = onHide;
  });
  const settled = autoHide && !error && !waiting && status === null && last !== undefined && !held;
  const content = bubbles.map((b) => `${b.id}:${b.text}`).join("|") + status;
  const fading = settled && fadedContent === content; // new words or a pointer over it end the fade at once
  useEffect(() => {
    if (!settled) return;
    const fade = setTimeout(() => setFadedContent(content), SHOW_MS);
    const gone = setTimeout(() => hide.current(), SHOW_MS + FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [settled, content]);

  return (
    <div
      role={error ? "alert" : "status"}
      className={`${styles.bubble} ${error ? styles.error : ""} ${fading ? styles.leaving : ""}`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
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
    </div>
  );
}
