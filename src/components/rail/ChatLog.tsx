"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";
import styles from "./ChatLog.module.css";

const NEAR_BOTTOM_PX = 80;

// The chat log. Screen readers hear new messages politely. It follows new messages, unless the student has
// scrolled up to read: `tick` changes when a message is added or updated.
export function ChatLog({
  empty = false,
  visible = true,
  tick,
  children,
}: {
  empty?: boolean;
  visible?: boolean;
  tick?: unknown;
  children?: ReactNode;
}) {
  const log = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  useLayoutEffect(() => {
    const el = log.current;
    if (el && visible && !empty && following.current) el.scrollTop = el.scrollHeight;
  }, [empty, tick, visible]);

  return (
    <div
      ref={log}
      role="log"
      aria-live="polite"
      className={styles.log}
      data-empty={empty || undefined}
      onScroll={(e) => {
        if (!visible) return;
        const el = e.currentTarget;
        following.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      }}
    >
      {children}
    </div>
  );
}
