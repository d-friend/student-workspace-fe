"use client";

import { Shell } from "@/components/Shell";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { useSidebar } from "@/components/sidebar/useSidebar";
import { useDesktop } from "@/hooks/useDesktop";
import { projectsFixture, sessionsFixture } from "./projectsFixture";

// ?n=8 repeats the subjects up to that many projects (to see the fold past 5); ?active=<project id> marks one as open.
export function ProjectsFixtureView({ count, active }: { count?: number; active?: string }) {
  const desktop = useDesktop();
  const side = useSidebar();
  const projects = count ? Array.from({ length: count }, (_, i) => ({ ...projectsFixture[i % projectsFixture.length], id: i < projectsFixture.length ? projectsFixture[i].id : `fx-${i}`, name: i < projectsFixture.length ? projectsFixture[i].name : `Môn ${i + 1}` })) : projectsFixture;
  return <Shell work={<p style={{ padding: 24 }}>Sidebar fixture</p>} layer={null} floatingPanels showCornerActions={!desktop} inert={side.drawerOpen && !desktop}
    sidebar={<Sidebar side={side} refreshKey="fixture" onNewProblem={() => {}} activeProjectId={active} preload={{ projects, sessions: sessionsFixture }} />}
    side={desktop ? side.mode : undefined} />;
}
