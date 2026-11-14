"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ProfileGate } from "@/components/ProfileGate";
import { Shell } from "@/components/Shell";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { useSidebar } from "@/components/sidebar/useSidebar";
import { useDesktop } from "@/hooks/useDesktop";
import { useProgress } from "@/hooks/useProgress";
import { currentSession, endSession, resumeSession, type ProgressItem } from "@/lib/api";
import { copy } from "@/lib/copy";
import { openProgressSession, progressCards, progressDateLabel } from "@/lib/progress";
import { track } from "@/lib/track";
import { MdInline } from "@/workspace/md";
import { ProgressCardCompact } from "@/workspace/ProgressCardCompact";
import styles from "./ProgressPage.module.css";

export function ProgressPage() {
  return <ProfileGate><ProgressContent /></ProfileGate>;
}

function ProgressContent() {
  const progress = useProgress();
  const side = useSidebar();
  const desktop = useDesktop();
  const id = useId();
  const tracked = useRef(false);
  const starting = useRef(false);
  const [newFailed, setNewFailed] = useState(false);
  const cards = useMemo(() => progressCards(progress.items), [progress.items]);
  const groups = useMemo(() => {
    const grouped = new Map<string, ProgressItem[]>();
    for (const item of cards) {
      const title = item.roadmap && Object.hasOwn(copy.roadmapTitle, item.roadmap) ? copy.roadmapTitle[item.roadmap] : copy.roadmapTitle.generic;
      const group = grouped.get(title);
      if (group) group.push(item);
      else grouped.set(title, [item]);
    }
    // API order is newest first; insertion order keeps each group and its newest card in order.
    return Array.from(grouped);
  }, [cards]);
  const learned = progress.items.filter(item => item.phase === "learn" && item.quizzes);

  useEffect(() => {
    if (!progress.ready || progress.failed || !cards.length || tracked.current) return;
    tracked.current = true;
    track("progress_opened", { place: "page", cards: cards.length });
  }, [progress.ready, progress.failed, cards.length]);

  const newProblem = async () => {
    if (starting.current) return;
    starting.current = true;
    setNewFailed(false);
    try {
      const session = await currentSession();
      track("new_problem_clicked", { turns_in_session: Math.floor((session?.messages.length ?? 0) / 2) }, session?.sessionId);
      if (session) await endSession(session.sessionId, "new_problem");
      window.location.assign("/");
    } catch {
      // Stay here if ending fails, so home cannot silently restore the old problem.
      setNewFailed(true);
    } finally {
      starting.current = false;
    }
  };

  const work = <div className={styles.page} aria-busy={!progress.ready}>
    <div className={styles.content}>
      <header>
        <h1 className={styles.title}>{copy.progressTitle}</h1>
        <p className={styles.subtitle}>{copy.progressSubtitle}</p>
      </header>
      {newFailed && <p className={styles.error} role="alert">{copy.progressNewFailed}</p>}
      {progress.ready && (progress.failed ? <div className={styles.state}>
        <p role="alert">{copy.progressError}</p>
        <button type="button" className={styles.action} onClick={progress.retry}>{copy.progressRetry}</button>
      </div> : <>
        {groups.map(([title, items], index) => <section key={title} aria-labelledby={`${id}-group-${index}`}>
          <h2 id={`${id}-group-${index}`} className={styles.group}>{title}</h2>
          <div className={styles.grid}>
            {items.map(item => <ProgressCardCompact key={item.workspace_id} item={item} variant="page" onOpen={() => void openProgressSession(item, "/")} />)}
          </div>
        </section>)}
        {learned.length > 0 && <section aria-labelledby={`${id}-learned`}>
          <h2 id={`${id}-learned`} className={styles.group}>{copy.progressLearned}</h2>
          <div className={styles.learned}>
            {learned.map(item => <button key={item.workspace_id} type="button" className={styles.learnRow} onClick={() => void openProgressSession(item, "/")}>
              <span className={styles.learnTitle}><MdInline text={item.title} /></span>{" "}
              <span className={styles.learnMeta}>
                <span>{copy.progressQuizCount(item.quizzes!.first_try, item.quizzes!.total)}</span>{" "}
                <time dateTime={item.created_at}>{progressDateLabel(item.created_at)}</time>
              </span>
            </button>)}
          </div>
        </section>}
        {cards.length === 0 && learned.length === 0 && <div className={styles.state}>
          <p>{copy.progressEmpty}</p>
          <Link className={styles.action} href="/">{copy.progressBack}</Link>
        </div>}
      </>)}
    </div>
  </div>;

  return <Shell work={work} layer={null} inert={side.drawerOpen && !desktop}
    sidebar={<Sidebar side={side} progress={{ active: true }} onNewProblem={() => void newProblem()} refreshKey="progress"
      onOpenSession={sessionId => { void resumeSession(sessionId).then(() => window.location.assign("/"), () => {}); }} />}
    side={desktop ? side.mode : undefined} />;
}
