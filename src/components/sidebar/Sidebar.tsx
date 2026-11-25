"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import logoMark from "../../../assets/logo-mark.png";
import { IconChartLine, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconMenu2, IconPlus, IconX } from "@tabler/icons-react";
import { useDesktop } from "@/hooks/useDesktop";
import { useProjects } from "@/hooks/useProjects";
import { useReviewCounts } from "@/hooks/useReviewCounts";
import { ApiError, deleteSession, listSessions, resumeSession, type ProjectSummary, type SessionList as SessionPage, type SessionSummary } from "@/lib/api";
import { copy } from "@/lib/copy";
import { track } from "@/lib/track";
import { Bone, Loading } from "@/components/Skeleton";
import { AccountMenu, type AccountStatus } from "./AccountMenu";
import { ProjectList } from "./ProjectList";
import { SessionList } from "./SessionList";
import type { useSidebar } from "./useSidebar";
import styles from "./Sidebar.module.css";

// The history before its first page is there: a group heading and a few session rows.
function HistorySkeleton() {
  return <section>
    <h2 className={styles.group}><Bone w={64} h={12} /></h2>
    {["78%", "62%", "70%", "54%"].map((w, i) => <div key={i} className={styles.skeletonRow}><Bone w={w} h={14} /></div>)}
  </section>;
}

// Once for this page load, even if the sidebar remounts.
let historyLoaded = false;

export function Sidebar({ side, onNewProblem, refreshKey, onOpenSession, progress, busy = false, menuTarget, activeProjectId, awayFromHome = false, preload, reviewTick = 0 }: {
  side: ReturnType<typeof useSidebar>;
  onNewProblem: () => void;
  refreshKey: string;
  onOpenSession?: (id: string) => void | Promise<boolean>; // false: it failed, nothing navigates
  progress?: { active?: boolean } | null;
  busy?: boolean; // Keep deletion blocked while a turn is streaming.
  menuTarget?: HTMLElement | null;
  activeProjectId?: string; // the project page on screen, if any
  awayFromHome?: boolean; // not on home: even the current session needs a navigation back to its workspace (progress.active implies it)
  preload?: { projects: ProjectSummary[]; sessions: SessionSummary[]; due?: Record<string, number> }; // fixture pages: show this and make no requests
  reviewTick?: number; // the page bumps it after a review answer, so the badges count what is still due
}) {
  const desktop = useDesktop();
  const visible = desktop ? side.mode === "open" : side.drawerOpen;
  const rail = desktop && side.mode === "rail";
  const [page, setPage] = useState<SessionPage>(() => ({ sessions: preload?.sessions ?? [], next_before: null }));
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [opening, setOpening] = useState<string | null>(null); // the session whose resume is in flight; the page reloads when it lands
  const [deleteError, setDeleteError] = useState<"historyDeleteFailed" | "historyDeleteBusy" | null>(null);
  const deletePending = useRef(false);
  const [account, setAccount] = useState<AccountStatus>({ signedIn: false, enabled: false });
  const request = useRef(0);
  const pending = useRef(false);
  const phoneTracked = useRef(false);
  const menu = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { closeDrawer, openDrawer } = side;
  const away = awayFromHome || !!progress?.active;
  const loaded = useProjects(visible && !preload, refreshKey);
  const projects = preload?.projects ?? loaded.projects;
  const counted = useReviewCounts(visible && !preload, `${refreshKey}|${reviewTick}`);
  const due = preload?.due ?? counted;
  const projectNames = useMemo(() => new Map(projects.map(project => [project.id, project.name])), [projects]);

  useEffect(() => {
    const revealAccount = (event: Event) => {
      if (!desktop && (event as CustomEvent).detail === "account") openDrawer();
    };
    window.addEventListener("df-sheet-open", revealAccount);
    return () => window.removeEventListener("df-sheet-open", revealAccount);
  }, [desktop, openDrawer]);

  useEffect(() => {
    if (!visible || desktop) phoneTracked.current = false;
    if (!visible || preload) return;
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
  }, [visible, refreshKey, desktop, preload]);

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
    const session = page.sessions.find(row => row.id === id);
    if (!session || (session.current && !away)) return;
    const createdAt = Date.parse(session.created_at);
    // Measure age from creation, so resuming does not make an old session look new.
    const ageDays = Number.isFinite(createdAt) ? Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000)) : 0;
    track("history_session_viewed", { tabs: session.tabs.length, age_days: ageDays }, id);
    if (opening) return;
    setOpening(id);
    // Success navigates away, so the row stays marked until the page unloads; only a failure clears it.
    const done = onOpenSession ? Promise.resolve(onOpenSession(id)) : resumeSession(id).then(() => window.location.reload(), () => false);
    void done.then(ok => { if (ok === false) setOpening(null); });
  };

  const remove = async (id: string) => {
    const session = page.sessions.find(row => row.id === id);
    if (!session || busy || pending.current || deletePending.current) return;
    if (!window.confirm(copy.historyDeleteConfirm(session.title || copy.historyUntitled))) return;
    deletePending.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSession(id);
      ++request.current; // Ignore any list response from before the deletion.
      pending.current = false;
      setLoading(false);
      setPage(previous => ({ ...previous, sessions: previous.sessions.filter(row => row.id !== id) }));
      if (session.current) window.location.reload();
    } catch (error) {
      setDeleteError(error instanceof ApiError && error.code === "session_busy" ? "historyDeleteBusy" : "historyDeleteFailed");
    } finally {
      deletePending.current = false;
      setDeleting(false);
    }
  };

  const more = async () => {
    if (!page.next_before || pending.current || deletePending.current) return;
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

  const menuButton = <button ref={menu} type="button" className={styles.menu} aria-label={copy.historyOpen} aria-expanded={side.drawerOpen} onClick={side.openDrawer}><IconMenu2 size={20} aria-hidden="true" /></button>;
  return (
    <>
      {!desktop && (menuTarget ? createPortal(menuButton, menuTarget) : menuTarget === undefined ? menuButton : null)}
      {!desktop && side.drawerOpen && <button type="button" className={styles.scrim} aria-label={copy.historyClose} tabIndex={-1} onClick={closeDrawer} />}
      <div ref={panel} className={styles.panel} data-rail={rail || undefined} data-drawer={side.drawerOpen || undefined}
        hidden={!desktop && !side.drawerOpen} tabIndex={-1} role={!desktop ? "dialog" : undefined} aria-modal={!desktop && side.drawerOpen ? true : undefined} aria-label={copy.historyLabel}>
        <div className={styles.header}>
          {!rail && <div className={styles.brand}><Image className={styles.mark} src={logoMark} alt="" priority />{copy.brand}</div>}
          {desktop ? <button type="button" className={styles.icon} aria-label={rail ? copy.sidebarExpand : copy.sidebarCollapse} onClick={side.toggle}>
            {rail ? <IconLayoutSidebarLeftExpand size={20} aria-hidden="true" /> : <IconLayoutSidebarLeftCollapse size={20} aria-hidden="true" />}
          </button> : <button type="button" className={styles.icon} aria-label={copy.drawerClose} onClick={closeDrawer}><IconX size={20} aria-hidden="true" /></button>}
        </div>
        <button type="button" className={styles.newProblem} aria-label={copy.newProblem} disabled={deleting} onClick={() => { onNewProblem(); if (!desktop) closeDrawer(); }}>
          <IconPlus size={16} aria-hidden="true" />{!rail && copy.newProblem}
        </button>
        {progress && <Link href="/progress" className={styles.progress} aria-label={copy.progressNav} aria-current={progress.active ? "page" : undefined} onClick={() => { if (!desktop) closeDrawer(); }}>
          <IconChartLine size={18} aria-hidden="true" />{!rail && copy.progressNav}
        </Link>}
        {visible && <div className={styles.list} aria-busy={loading}>
          <ProjectList projects={projects} activeId={activeProjectId} onOpen={project => {
            track("project_opened", { project_id: project.id, via: "sidebar" });
            if (!desktop) closeDrawer();
          }} due={due} onReview={() => { if (!desktop) closeDrawer(); }} />
          <Loading busy={loading && !page.sessions.length} label={copy.loadingHistory} skeleton={<HistorySkeleton />}>
            <SessionList sessions={page.sessions} projectNames={projectNames} openingId={opening} disabled={deleting || loading || opening !== null} deleteDisabled={busy || deleting || loading} onDelete={id => void remove(id)} onChoose={id => {
              // On /progress even the current session needs a navigation back to its workspace.
              if (away || !page.sessions.find(row => row.id === id)?.current) open(id);
              if (!desktop) closeDrawer();
            }} />
          </Loading>
          {deleteError && <p className={styles.deleteError} role="alert">{copy[deleteError]}</p>}
          {!loading && !page.sessions.length && <p className={styles.empty}>{copy.historyEmpty}</p>}
          {page.next_before && <button type="button" className={styles.more} disabled={loading || deleting} onClick={() => void more()}>{copy.historyMore}</button>}
        </div>}
        <div className={styles.footer}>
          {!rail && account.enabled && !account.signedIn && <p className={styles.guest}>{copy.historyGuest}</p>}
          <AccountMenu rail={rail} onStatus={setAccount} />
        </div>
      </div>
    </>
  );
}
