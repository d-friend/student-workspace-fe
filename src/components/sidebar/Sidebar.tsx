"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import logoMark from "../../../assets/logo-mark.png";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconMenu2, IconPlus, IconX } from "@tabler/icons-react";
import { useDesktop } from "@/hooks/useDesktop";
import { listSessions, resumeSession, type SessionList as SessionPage } from "@/lib/api";
import { copy } from "@/lib/copy";
import { track } from "@/lib/track";
import { AccountMenu, type AccountStatus } from "./AccountMenu";
import { SessionList } from "./SessionList";
import type { useSidebar } from "./useSidebar";
import styles from "./Sidebar.module.css";

// Once for this page load, even if the sidebar remounts.
let historyLoaded = false;

export function Sidebar({ side, onNewProblem, refreshKey, onOpenSession, busy = false }: {
  side: ReturnType<typeof useSidebar>;
  onNewProblem: () => void;
  refreshKey: string;
  onOpenSession?: (id: string) => void;
  busy?: boolean; // a turn is streaming: switching sessions or starting a new one would end it mid-turn
}) {
  const desktop = useDesktop();
  const visible = desktop ? side.mode === "open" : side.drawerOpen;
  const rail = desktop && side.mode === "rail";
  const [page, setPage] = useState<SessionPage>({ sessions: [], next_before: null });
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<AccountStatus>({ signedIn: false, enabled: false });
  const request = useRef(0);
  const pending = useRef(false);
  const phoneTracked = useRef(false);
  const menu = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { closeDrawer, openDrawer } = side;

  useEffect(() => {
    const revealAccount = (event: Event) => {
      if (!desktop && (event as CustomEvent).detail === "account") openDrawer();
    };
    window.addEventListener("df-sheet-open", revealAccount);
    return () => window.removeEventListener("df-sheet-open", revealAccount);
  }, [desktop, openDrawer]);

  useEffect(() => {
    if (!visible || desktop) phoneTracked.current = false;
    if (!visible) return;
    let active = true;
    const requests = request;
    const id = ++request.current;
    pending.current = true;
    // A newly visible history or a refreshed session starts a fresh page request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const phoneOpen = !desktop && !phoneTracked.current;
    listSessions().catch((): SessionPage => ({ sessions: [], next_before: null })).then(result => {
      if (!active || request.current !== id) return;
      setPage(result);
      setLoading(false);
      pending.current = false;
      if (!desktop) phoneTracked.current = true;
      if (!historyLoaded || phoneOpen) {
        track("history_opened", { sessions: result.sessions.length });
        historyLoaded = true;
      }
    });
    return () => { active = false; ++requests.current; pending.current = false; };
  }, [visible, refreshKey, desktop]);

  useEffect(() => {
    if (desktop || !side.drawerOpen) return;
    const returnFocus = menu.current;
    (panel.current?.querySelector<HTMLElement>('[role="dialog"]') ?? panel.current)?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Let an account sheet consume Escape before closing its containing drawer.
        if (panel.current?.querySelector('[role="dialog"]')) return;
        event.preventDefault();
        closeDrawer();
      }
      if (event.key === "Tab") {
        const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)');
        if (!controls?.length) return;
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      window.dispatchEvent(new CustomEvent("df-sheet-open", { detail: "history" }));
      returnFocus?.focus();
    };
  }, [desktop, side.drawerOpen, closeDrawer]);

  // Opening a past session resumes it, then a reload runs the app's normal restore. A failed resume leaves things as they were.
  const open = (id: string) => {
    if (onOpenSession) return onOpenSession(id);
    resumeSession(id).then(() => window.location.reload(), () => {});
  };

  const more = async () => {
    if (!page.next_before || pending.current) return;
    const id = ++request.current;
    pending.current = true;
    setLoading(true);
    try {
      const result = await listSessions(page.next_before);
      if (request.current !== id) return;
      setPage(previous => ({ sessions: [...previous.sessions, ...result.sessions.filter(row => !previous.sessions.some(old => old.id === row.id))], next_before: result.next_before }));
    } catch {
      // Keep the loaded history available and let the student retry.
    } finally {
      if (request.current === id) { pending.current = false; setLoading(false); }
    }
  };

  return (
    <>
      {!desktop && <button ref={menu} type="button" className={styles.menu} aria-label={copy.historyOpen} aria-expanded={side.drawerOpen} onClick={side.openDrawer}><IconMenu2 size={20} aria-hidden="true" /></button>}
      {!desktop && side.drawerOpen && <button type="button" className={styles.scrim} aria-label={copy.historyClose} tabIndex={-1} onClick={closeDrawer} />}
      <div ref={panel} className={styles.panel} data-rail={rail || undefined} data-drawer={side.drawerOpen || undefined}
        hidden={!desktop && !side.drawerOpen} tabIndex={-1} role={!desktop ? "dialog" : undefined} aria-modal={!desktop && side.drawerOpen ? true : undefined} aria-label={copy.historyLabel}>
        <div className={styles.header}>
          {!rail && <div className={styles.brand}><Image className={styles.mark} src={logoMark} alt="" priority />{copy.brand}</div>}
          {desktop ? <button type="button" className={styles.icon} aria-label={rail ? copy.sidebarExpand : copy.sidebarCollapse} onClick={side.toggle}>
            {rail ? <IconLayoutSidebarLeftExpand size={20} aria-hidden="true" /> : <IconLayoutSidebarLeftCollapse size={20} aria-hidden="true" />}
          </button> : <button type="button" className={styles.icon} aria-label={copy.drawerClose} onClick={closeDrawer}><IconX size={20} aria-hidden="true" /></button>}
        </div>
        <button type="button" className={styles.newProblem} aria-label={copy.newProblem} disabled={busy} onClick={() => { onNewProblem(); if (!desktop) closeDrawer(); }}>
          <IconPlus size={16} aria-hidden="true" />{!rail && copy.newProblem}
        </button>
        {visible && <div className={styles.list} aria-busy={loading}>
          <SessionList sessions={page.sessions} disabled={busy} onChoose={id => {
            // Choosing the session that is already current changes nothing: just close the drawer.
            if (!page.sessions.find(row => row.id === id)?.current) open(id);
            if (!desktop) closeDrawer();
          }} />
          {!loading && !page.sessions.length && <p className={styles.empty}>{copy.historyEmpty}</p>}
          {page.next_before && <button type="button" className={styles.more} disabled={loading} onClick={() => void more()}>{copy.historyMore}</button>}
        </div>}
        <div className={styles.footer}>
          {!rail && account.enabled && !account.signedIn && <p className={styles.guest}>{copy.historyGuest}</p>}
          <AccountMenu rail={rail} onStatus={setAccount} />
        </div>
      </div>
    </>
  );
}
