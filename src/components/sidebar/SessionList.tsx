import { IconCheck } from "@tabler/icons-react";
import type { SessionSummary } from "@/lib/api";
import { copy, getLocale } from "@/lib/copy";
import { groupSessions } from "./groupSessions";
import styles from "./Sidebar.module.css";

export function SessionList({ sessions, onChoose, disabled = false }: { sessions: SessionSummary[]; onChoose: (id: string) => void; disabled?: boolean }) {
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
          <button type="button" key={session.id} className={styles.session} title={`${title} · ${metadata}`}
            aria-current={session.current ? "true" : undefined} disabled={disabled} onClick={() => onChoose(session.id)}>
            <span className={styles.title}>{title}</span>
            <span className={styles.srOnly}>{metadata}</span>
            {session.done && <IconCheck className={styles.done} size={14} aria-label={copy.historyDone} />}
          </button>
        );
      })}
    </section>
  ));
}
