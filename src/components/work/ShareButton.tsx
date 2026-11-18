"use client";

import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { IconDots, IconShare } from "@tabler/icons-react";
import { copy, copyFor } from "@/lib/copy";
import { shareWorkspace } from "@/lib/share";
import { track } from "@/lib/track";
import styles from "./ShareButton.module.css";

export function ShareButton({ workspaceId, sessionId, workspaceCount, sessionUnready, title, disabled = false, overflow }: {
  workspaceId: string; sessionId?: string | null; workspaceCount: number; sessionUnready: boolean; title: string; disabled?: boolean;
  overflow?: {
    triggerRef: RefObject<HTMLButtonElement | null>;
    reset?: { label: string; disabled: boolean; onClick: () => void };
  };
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [open, setOpen] = useState<"actions" | "share" | null>(null);
  const standalone = useRef<HTMLButtonElement>(null);
  const button = overflow?.triggerRef ?? standalone;
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const hasScopes = workspaceCount > 1 && !!sessionId;
  const inOverflow = !!overflow;
  const hasMenu = inOverflow || hasScopes;
  const labels = inOverflow ? copy : copyFor("vi");
  const homeMenu = inOverflow ? "actions" : "share";
  const reset = overflow?.reset;
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 2500);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    if (!open) return;
    (menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? button.current)?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) {
        setOpen(null);
        if (inOverflow) button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, button, inOverflow]);

  const close = () => {
    setOpen(null);
    button.current?.focus();
  };

  const share = async (scope: "workspace" | "session") => {
    if (scope === "session" && !sessionId) return;
    if (open) close();
    setBusy(true);
    setFeedback("");
    track("share_clicked", { scope, workspace_count: workspaceCount, target_id: scope === "session" ? sessionId! : workspaceId }, sessionId);
    const path = scope === "session" ? `/s/session/${encodeURIComponent(sessionId!)}` : `/s/${encodeURIComponent(workspaceId)}`;
    try {
      const result = await shareWorkspace(window.location.origin, path, title, navigator);
      if (result === "copied") setFeedback(labels.workspaceShareCopied);
    } catch {
      setFeedback(labels.workspaceShareFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap} ref={wrap} data-overflow={!!overflow || undefined} onBlur={(event) => {
      // A null relatedTarget (Safari clicks on buttons, window blur) must not close: pointerdown handles outside clicks.
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(null);
    }} onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (open && inOverflow && event.key === "Tab") setOpen(null);
      if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? index + 1 : index < 0 ? items.length - 1 : index - 1;
        items[(next + items.length) % items.length]?.focus();
      }
      if (overflow && !open && !busy && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        setOpen(homeMenu);
      }
    }}>
      <button ref={button} type="button" className={styles.button} disabled={!hasMenu && disabled} aria-disabled={busy || undefined} title={!hasMenu && disabled ? labels.workspaceShareUnready : undefined} aria-label={overflow ? labels.workspaceActions : undefined} aria-haspopup={hasMenu ? "menu" : undefined} aria-expanded={hasMenu ? !!open : undefined} aria-controls={open ? menuId : undefined} onClick={() => {
        if (busy) return;
        if (open) close();
        else if (hasMenu) setOpen(homeMenu);
        else void share("workspace");
      }}>
        {overflow ? <IconDots size={22} aria-hidden="true" /> : <><IconShare size={18} stroke={1.8} aria-hidden="true" />{labels.workspaceShare}</>}
      </button>
      {open && <div id={menuId} ref={menu} role="menu" aria-label={open === "actions" ? labels.workspaceActions : labels.workspaceShare} className={styles.menu}>
        {open === "actions" ? <>
          {reset && <button type="button" role="menuitem" tabIndex={-1} disabled={reset.disabled} onClick={() => { close(); reset.onClick(); }}>{reset.label}</button>}
          <button type="button" role="menuitem" tabIndex={-1} disabled={!hasScopes && disabled} title={!hasScopes && disabled ? labels.workspaceShareUnready : undefined} onClick={() => {
            if (hasScopes) setOpen("share");
            else void share("workspace");
          }}>{labels.workspaceShare}</button>
        </> : <>
          <button type="button" role="menuitem" tabIndex={overflow ? -1 : undefined} disabled={disabled} title={disabled ? labels.workspaceShareUnready : undefined} onClick={() => void share("workspace")}>{labels.workspaceShareOne}</button>
          <span role="presentation" title={sessionUnready ? labels.workspaceShareUnready : undefined}><button type="button" role="menuitem" tabIndex={overflow ? -1 : undefined} disabled={sessionUnready} onClick={() => void share("session")}>{labels.workspaceShareSession(workspaceCount)}</button></span>
        </>}
      </div>}
      <span role="status" className={styles.feedback}>{feedback}</span>
    </div>
  );
}
