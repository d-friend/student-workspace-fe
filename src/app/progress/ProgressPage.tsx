"use client";

import { useEffect, useMemo, useRef } from "react";
import { ProfileGate } from "@/components/ProfileGate";
import { Shell } from "@/components/Shell";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { useSidebar } from "@/components/sidebar/useSidebar";
import { useDesktop } from "@/hooks/useDesktop";
import { useLeaveSession } from "@/hooks/useLeaveSession";
import { useProgress } from "@/hooks/useProgress";
import { useTree } from "@/hooks/useTree";
import { resumeSession } from "@/lib/api";
import { progressCards } from "@/lib/progress";
import { track } from "@/lib/track";
import { ProgressView } from "./ProgressView";

export function ProgressPage() {
  return <ProfileGate><ProgressContent /></ProfileGate>;
}

function ProgressContent() {
  const progress = useProgress();
  const { tree, ready: treeReady } = useTree();
  const fresh = useLeaveSession();
  const side = useSidebar();
  const desktop = useDesktop();
  const tracked = useRef(false);
  const treeTracked = useRef(false);
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

  const work = <ProgressView items={progress.items} tree={tree} ready={progress.ready && treeReady} failed={progress.failed} onRetry={progress.retry} newFailed={fresh.failed} />;

  return <Shell work={work} layer={null} floatingPanels showCornerActions={!desktop} inert={side.drawerOpen && !desktop}
    sidebar={<Sidebar side={side} progress={{ active: true }} onNewProblem={() => void fresh.leave("/", true)} refreshKey="progress"
      onOpenSession={sessionId => resumeSession(sessionId).then(() => { window.location.assign("/"); return true; }, () => false)} />}
    side={desktop ? side.mode : undefined} />;
}
