"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import styles from "./Skeleton.module.css";

// showAfter: a load faster than this never shows a skeleton. hold: once shown, it stays at least this long, so it does not flicker away.
// Production never changes these; the unit-test setup sets showAfter to null (never show), so a slow machine cannot make a test race a skeleton.
export const loadingTiming: { showAfter: number | null; hold: number } = { showAfter: 150, hold: 300 };

// "wait": busy, not yet shown. "show": on screen. "done": show the content.
export function useLoadingPhase(busy: boolean): "wait" | "show" | "done" {
  const [shown, setShown] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    if (busy && !shown) {
      if (loadingTiming.showAfter === null) return;
      const timer = setTimeout(() => { since.current = Date.now(); setShown(true); }, loadingTiming.showAfter);
      return () => clearTimeout(timer);
    }
    if (!busy && shown) {
      const timer = setTimeout(() => setShown(false), Math.max(0, loadingTiming.hold - (Date.now() - since.current)));
      return () => clearTimeout(timer);
    }
  }, [busy, shown]);
  return shown ? "show" : busy ? "wait" : "done";
}

// One grey shape. Give it the size of what replaces it.
export function Bone({ w, h, className, style }: { w?: number | string; h?: number | string; className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={className ? `${styles.block} ${className}` : styles.block} style={{ width: w, height: h, ...style }} />;
}

// Shows `skeleton` while `busy` (after a short delay) and fades `children` in when it ends. Pass children that are safe to build only when
// not busy (`data && <View data={data} />`). Neither wrapper draws a box.
export function Loading({ busy, label, skeleton, children }: { busy: boolean; label: string; skeleton: ReactNode; children: ReactNode }) {
  const phase = useLoadingPhase(busy);
  const [fade, setFade] = useState(busy); // fade only what arrives after a wait
  if (phase !== "done" && !fade) setFade(true);
  if (phase === "done") return <div className={styles.in} data-fade={fade || undefined}>{children}</div>;
  return <div className={styles.live} role="status" aria-label={label} aria-busy="true" data-wait={phase === "wait" || undefined}>{skeleton}</div>;
}

// A label that stays put while its action waits: it keeps its width and a spinner turns up on top of it.
export function InPlace({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <span className={styles.inplace}><span data-hide={busy || undefined}>{children}</span>{busy && <IconLoader2 className={styles.spin} size={16} aria-hidden="true" />}</span>;
}

// The same spinner on its own, for icons that turn into progress.
export function Spin({ size = 20 }: { size?: number }) {
  return <IconLoader2 className={styles.spin} size={size} aria-hidden="true" />;
}
