import { IconCheck } from "@tabler/icons-react";
import type { ProjectSessions } from "@/hooks/useProjectSessions";
import { Loading } from "@/components/Skeleton";
import { copy } from "@/lib/copy";
import { progressDateLabel } from "@/lib/progress";
import { MdInline } from "@/workspace/md";
import { SessionRowsSkeleton } from "./ProjectSkeleton";
import styles from "./Project.module.css";

// "Gần đây": this project's sessions, newest first. The overview's composer is the way to start a new one.
export function ProjectSessionList({ sessions, onOpen, openFailed }: { sessions: ProjectSessions; onOpen: (id: string) => void; openFailed: boolean }) {
  const phases = { learn: copy.phaseLearn, solve: copy.phaseSolve, practice: copy.phasePractice, review: copy.phaseReview };
  return <Loading busy={!sessions.ready} label={copy.loadingSessions} skeleton={<SessionRowsSkeleton />}><div className={styles.sessions} aria-busy={sessions.loadingMore || undefined}>
    {openFailed && <p className={styles.error} role="alert">{copy.projectSessionOpenFailed}</p>}
    {sessions.ready && sessions.failed && <p className={styles.error} role="alert">{copy.projectSessionsFailed}</p>}
    {sessions.ready && !sessions.failed && !sessions.sessions.length && <p className={styles.empty}>{copy.projectSessionsEmpty}</p>}
    {sessions.sessions.length > 0 && <div className={styles.list}>
      {sessions.sessions.map(session => {
        const kinds = [...new Set(session.tabs.map(tab => phases[tab.phase]))].join(" · ");
        return <button key={session.id} type="button" className={styles.row} onClick={() => onOpen(session.id)}>
          <span className={styles.rowTitle}>{session.title ? <MdInline text={session.title} /> : copy.historyUntitled}</span>
          <span className={styles.rowMeta}>
            {kinds && <span>{kinds}</span>}
            {session.done && <IconCheck size={14} aria-label={copy.historyDone} />}
            <time dateTime={session.last_active_at}>{progressDateLabel(session.last_active_at)}</time>
          </span>
        </button>;
      })}
    </div>}
    {sessions.hasMore && <button type="button" className={styles.secondary} disabled={sessions.loadingMore} onClick={sessions.more}>{copy.historyMore}</button>}
  </div></Loading>;
}
