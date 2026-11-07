"use client";

import { useEffect, useRef, useState } from "react";
import { IconShare } from "@tabler/icons-react";
import { shareWorkspace } from "@/lib/share";
import { track } from "@/lib/track";
import styles from "./ShareButton.module.css";

export function ShareButton({ workspaceId, sessionId, workspaceCount, sessionUnready, title, disabled = false }: {
  workspaceId: string; sessionId?: string | null; workspaceCount: number; sessionUnready: boolean; title: string; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const hasMenu = workspaceCount > 1 && !!sessionId;
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 2500);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const share = async (scope: "workspace" | "session") => {
    if (scope === "session" && !sessionId) return;
    if (open) button.current?.focus();
    setOpen(false);
    setBusy(true);
    setFeedback("");
    track("share_clicked", { scope, workspace_count: workspaceCount }, sessionId);
    const path = scope === "session" ? `/s/session/${encodeURIComponent(sessionId!)}` : `/s/${encodeURIComponent(workspaceId)}`;
    try {
      const result = await shareWorkspace(window.location.origin, path, title, navigator);
      if (result === "copied") setFeedback("Đã sao chép liên kết");
    } catch {
      setFeedback("Chưa thể chia sẻ. Bạn thử lại nhé.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap} ref={wrap} onBlur={(event) => {
      // A null relatedTarget (Safari clicks on buttons, window blur) must not close: pointerdown handles outside clicks.
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        button.current?.focus();
      }
      if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    }}>
      <button ref={button} type="button" className={styles.button} disabled={!hasMenu && disabled} aria-disabled={busy || undefined} title={!hasMenu && disabled ? "Mô phỏng đang được dựng" : undefined} aria-haspopup={hasMenu ? "menu" : undefined} aria-expanded={hasMenu ? open : undefined} onClick={() => {
        if (busy) return;
        if (hasMenu) setOpen(!open);
        else void share("workspace");
      }}>
        <IconShare size={18} stroke={1.8} aria-hidden="true" />
        Chia sẻ
      </button>
      {open && <div ref={menu} role="menu" className={styles.menu}>
        <button type="button" role="menuitem" disabled={disabled} title={disabled ? "Mô phỏng đang được dựng" : undefined} onClick={() => void share("workspace")}>Chia sẻ bài này</button>
        <span title={sessionUnready ? "Mô phỏng đang được dựng" : undefined}><button type="button" role="menuitem" disabled={sessionUnready} onClick={() => void share("session")}>Chia sẻ cả phiên ({workspaceCount} bài)</button></span>
      </div>}
      <span role="status" className={styles.feedback}>{feedback}</span>
    </div>
  );
}
