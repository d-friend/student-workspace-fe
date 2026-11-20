"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProfileGate } from "@/components/ProfileGate";
import { Shell } from "@/components/Shell";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { useSidebar } from "@/components/sidebar/useSidebar";
import { useDesktop } from "@/hooks/useDesktop";
import { useProgress } from "@/hooks/useProgress";
import { useTree } from "@/hooks/useTree";
import { currentSession, endSession, resumeSession } from "@/lib/api";
import { progressCards } from "@/lib/progress";
import { track } from "@/lib/track";
import { ProgressView } from "./ProgressView";

export function ProgressPage() {
  return <ProfileGate><ProgressContent /></ProfileGate>;
}

function ProgressContent() {
  const progress = useProgress();
  const { tree, ready: treeReady } = useTree();
  const side = useSidebar();
  const desktop = useDesktop();
  const tracked = useRef(false);
  const treeTracked = useRef(false);
  const starting = useRef(false);
  const [newFailed, setNewFailed] = useState(false);
  const cardCount = useMemo(() => progressCards(progress.items).length, [progress.items]);

  useEffect(() => {
    if (!progress.ready || progress.failed || !cardCount || tracked.current) return;
    tracked.current = true;
    track("progress_opened", { place: "page", cards: cardCount });
  }, [progress.ready, progress.failed, cardCount]);

  const treeNodes = tree?.nodes.length ?? 0;
  useEffect(() => {
    if (!treeReady || !treeNodes || treeTracked.current) return;
    treeTracked.current = true;
    track("tree_opened", { nodes: treeNodes });
  }, [treeReady, treeNodes]);

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

  const work = <ProgressView items={progress.items} tree={tree} ready={progress.ready && treeReady} failed={progress.failed} onRetry={progress.retry} newFailed={newFailed} />;

  return <Shell work={work} layer={null} floatingPanels showCornerActions={!desktop} inert={side.drawerOpen && !desktop}
    sidebar={<Sidebar side={side} progress={{ active: true }} onNewProblem={() => void newProblem()} refreshKey="progress"
      onOpenSession={sessionId => { void resumeSession(sessionId).then(() => window.location.assign("/"), () => {}); }} />}
    side={desktop ? side.mode : undefined} />;
}
