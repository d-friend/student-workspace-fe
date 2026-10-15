import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import styles from "./ChatLog.module.css";

// The chat log. Screen readers hear new messages politely.
export function ChatLog({ empty = false, children }: { empty?: boolean; children?: ReactNode }) {
  return (
    <div role="log" aria-live="polite" className={styles.log}>
      {empty ? <p className={styles.empty}>{copy.railEmpty}</p> : children}
    </div>
  );
}
