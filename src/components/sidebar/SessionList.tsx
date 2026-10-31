import { IconCheck, IconTrash } from "@tabler/icons-react";
import type { SessionSummary } from "@/lib/api";
import { copy, getLocale } from "@/lib/copy";
import { groupSessions } from "./groupSessions";
import styles from "./Sidebar.module.css";

export function SessionList({ sessions, onChoose, onDelete, disabled = false }: { sessions: SessionSummary[]; onChoose: (id: string) => void; onDelete?: (id: string) => void; disabled?: boolean }) {
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
          <div key={session.id} className={styles.sessionRow}>
            <button type="button" className={styles.session} title={`${title} · ${metadata}`}
              aria-current={session.current ? "true" : undefined} disabled={disabled} onClick={() => onChoose(session.id)}>
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
