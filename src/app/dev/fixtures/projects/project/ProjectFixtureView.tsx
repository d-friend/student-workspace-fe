"use client";

import { useState } from "react";
import { ProjectView } from "@/components/project/ProjectView";
import { Shell } from "@/components/Shell";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { useSidebar } from "@/components/sidebar/useSidebar";
import { useDesktop } from "@/hooks/useDesktop";
import { screenOf, type ProjectScreen } from "@/lib/projectMap";
import { projectsFixture, projectViews, readers, sessionsFixture } from "../projectsFixture";

const noop = () => {};

export function ProjectFixtureView({ projectId, tab: initial, block }: { projectId: string; tab?: string; block?: string }) {
  const desktop = useDesktop();
  const side = useSidebar();
  const [screen, setScreen] = useState<ProjectScreen>(screenOf(initial ?? null));
  const project = projectViews[projectId];
  const mine = sessionsFixture.filter(s => s.project_id === projectId);
  const view = <ProjectView project={project} screen={screen} onOpen={setScreen} onBack={() => setScreen("overview")}
    sessions={{ sessions: mine, ready: true, failed: false, hasMore: false, loadingMore: false, more: noop }} onOpenSession={noop} openFailed={false}
    onSend={async () => false} sendError={null} reader={{ pages: readers[projectId], failed: false }} block={block ?? null} onLearnMore={noop} learnFailed={false} onViewSource={noop} onUploaded={noop} />;
  return <Shell work={view} layer={null} floatingPanels showCornerActions={!desktop} inert={side.drawerOpen && !desktop}
    sidebar={<Sidebar side={side} refreshKey="fixture" onNewProblem={noop} awayFromHome progress={{ active: false }} activeProjectId={projectId}
      preload={{ projects: projectsFixture, sessions: sessionsFixture }} />}
    side={desktop ? side.mode : undefined} />;
}
