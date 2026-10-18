"use client";

import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useState, useSyncExternalStore } from "react";
import { copy } from "@/lib/copy";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./Shell.module.css";

const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 300;
const MAX_WIDTH = 640;
const KEY_STEP = 16;
const KEY = "df-rail-width";

const clamp = (w: number) => Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));

function savedWidth(): number | null {
  try {
    const saved = Number(localStorage.getItem(KEY));
    return saved ? clamp(saved) : null;
  } catch {
    return null;
  }
}

// Desktop: the rail on the left (resizable, default 380px), work fills the rest. Below 800px: work on top, rail below.
export function Shell({ rail, work }: { rail: ReactNode; work: ReactNode }) {
  // null on the server and the first client render, so both agree; the saved width applies after hydration.
  const saved = useSyncExternalStore(() => () => {}, savedWidth, () => null);
  const [live, setWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const width = live ?? saved ?? DEFAULT_WIDTH;

  const save = (w: number) => {
    try {
      localStorage.setItem(KEY, String(w));
    } catch {}
  };
  const resize = (w: number) => {
    const next = clamp(w);
    setWidth(next);
    save(next);
  };

  // Pointer capture keeps the drag alive over the sandboxed iframe, which would otherwise swallow the events.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging) setWidth(clamp(e.clientX));
  };
  const onPointerUp = () => {
    setDragging(false);
    save(width);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") resize(width - KEY_STEP);
    else if (e.key === "ArrowRight") resize(width + KEY_STEP);
    else return;
    e.preventDefault();
  };

  return (
    <div className={styles.shell} style={{ "--rail-w": `${width}px` } as CSSProperties}>
      <aside aria-label={copy.chatLabel} className={styles.rail}>
        {rail}
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={copy.resizeChat}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        className={styles.handle}
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => resize(DEFAULT_WIDTH)}
        onKeyDown={onKeyDown}
      />
      <main aria-label={copy.workLabel} className={styles.work}>
        {work}
      </main>
      <ThemeToggle />
    </div>
  );
}
