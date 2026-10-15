"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";
import { copy } from "@/lib/copy";
import styles from "./ChatLog.module.css";

const NEAR_BOTTOM_PX = 80;

// The chat log. Screen readers hear new messages politely. It follows new messages, unless the student has
// scrolled up to read: `tick` changes when a message is added or updated.
export function ChatLog({
  empty = false,
  tick,
  children,
}: {
  empty?: boolean;
  tick?: unknown;
  children?: ReactNode;
}) {
  const log = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  useLayoutEffect(() => {
    const el = log.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [tick]);

  return (
    <div
      ref={log}
      role="log"
      aria-live="polite"
      className={styles.log}
      onScroll={(e) => {
        const el = e.currentTarget;
        following.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      }}
    >
      {empty ? <p className={styles.empty}>{copy.railEmpty}</p> : children}
    </div>
  );
}
