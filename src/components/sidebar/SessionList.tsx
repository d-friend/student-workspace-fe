"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { IconCheck, IconTrash } from "@tabler/icons-react";
import type { SessionSummary } from "@/lib/api";
import { copy, getLocale } from "@/lib/copy";
import { groupSessions } from "./groupSessions";
import styles from "./Sidebar.module.css";

export function SessionList({ sessions, onChoose, onDelete, disabled = false }: { sessions: SessionSummary[]; onChoose: (id: string) => void; onDelete?: (id: string) => void; disabled?: boolean }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<{ id: string; x: number; y: number; held: boolean } | null>(null);
  const stopTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!revealed) return;
    const outside = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-session-row]")?.getAttribute("data-session-row") !== revealed) {
        setRevealed(null);
      }
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setRevealed(null); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [revealed]);
  const startHold = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (disabled || !onDelete || (event.pointerType !== "touch" && event.pointerType !== "pen")) return;
    stopTimer();
    gesture.current = { id, x: event.clientX, y: event.clientY, held: false };
    timer.current = setTimeout(() => {
      if (!gesture.current) return;
      gesture.current.held = true;
      setRevealed(id);
      timer.current = null;
    }, 500);
  };
  const labels = { today: copy.historyToday, yesterday: copy.historyYesterday, week: copy.historyWeek, older: copy.historyOlder };
  const phases = { learn: copy.phaseLearn, solve: copy.phaseSolve, practice: copy.phasePractice };
  return groupSessions(sessions, new Date()).map(group => (
    <section key={group.key}>
      <h2 className={styles.group}>{labels[group.key]}</h2>
      {group.sessions.map(session => {
        const title = session.title || copy.historyUntitled;
        const date = new Date(session.last_active_at).toLocaleString(getLocale(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
        const phaseLabels = [...new Set(session.tabs.map(tab => tab.phase))].map(phase => phases[phase]);
        const metadata = [date, ...phaseLabels, ...(session.tabs.length > 1 ? [session.tabs.length] : [])].join(" · ");
        return (
          <div key={session.id} className={styles.sessionRow} data-session-row={session.id} data-actions={revealed === session.id || undefined}>
            <button type="button" className={styles.session} title={`${title} · ${metadata}`}
              aria-current={session.current ? "true" : undefined} disabled={disabled}
              onPointerDown={event => startHold(event, session.id)}
              onPointerUp={stopTimer}
              onPointerCancel={() => { stopTimer(); gesture.current = null; }}
              onPointerMove={event => {
                const current = gesture.current;
                if (current && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 10) {
                  stopTimer(); gesture.current = null; setRevealed(null);
                }
              }}
              onContextMenu={event => { if (gesture.current?.id === session.id) event.preventDefault(); }}
              onClick={event => {
                if (gesture.current?.id === session.id && gesture.current.held) {
                  gesture.current = null;
                  event.preventDefault();
                  return;
                }
                gesture.current = null;
                setRevealed(null);
                onChoose(session.id);
              }}>
              <span id={`history-session-${session.id}`} className={styles.title}>{title}</span>
              <span className={styles.srOnly}>{metadata}</span>
              {session.done && <IconCheck className={styles.done} size={14} aria-label={copy.historyDone} />}
            </button>
            {onDelete && <button type="button" className={styles.delete} disabled={disabled}
              aria-label={copy.historyDelete} aria-describedby={`history-session-${session.id}`} title={`${copy.historyDelete}: ${title}`}
              onClick={() => onDelete(session.id)}>
              <IconTrash size={16} aria-hidden="true" />
            </button>}
          </div>
        );
      })}
    </section>
  ));
}
