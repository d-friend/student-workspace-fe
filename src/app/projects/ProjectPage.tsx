"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { PackSheet } from "@/components/pack/PackSheet";
import { ProjectView } from "@/components/project/ProjectView";
import { ProfileGate } from "@/components/ProfileGate";
import { Shell } from "@/components/Shell";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { useSidebar } from "@/components/sidebar/useSidebar";
import { useDesktop } from "@/hooks/useDesktop";
import { useLeaveSession } from "@/hooks/useLeaveSession";
import { useProject, useReader } from "@/hooks/useProject";
import { useProjectSessions } from "@/hooks/useProjectSessions";
import { type Pack, resumeSession } from "@/lib/api";
import { copy } from "@/lib/copy";
import { tabOf, type ProjectTab } from "@/lib/projectMap";
import { track } from "@/lib/track";
import styles from "@/components/project/Project.module.css";

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  return <ProfileGate><Suspense><ProjectContent key={id} id={id} /></Suspense></ProfileGate>;
}

function ProjectContent({ id }: { id: string }) {
  const query = useSearchParams();
  const { data: project, error, reload: reloadProject } = useProject(id);
  const [tab, setTab] = useState<ProjectTab>(() => tabOf(query.get("tab")));
  const [block] = useState(() => query.get("block")); // set by "Xem nguồn"; the reader scrolls to it
  const [opened, setOpened] = useState<ProjectTab[]>(() => [tab]); // a tab loads its data the first time it is shown
  const [openFailed, setOpenFailed] = useState(false);
  const [sheet, setSheet] = useState<Pack | null>(null); // the upload status sheet
  const sessions = useProjectSessions(id, opened.includes("sessions"));
  const reader = useReader(id, opened.includes("sources"));
  const fresh = useLeaveSession();
  const learn = useLeaveSession();
  const side = useSidebar();
  const desktop = useDesktop();
  const tracked = useRef<string | null>(null);

  // One project_tab_viewed per tab shown, the first one once the project has loaded.
  useEffect(() => {
    if (!project || tracked.current === tab) return;
    tracked.current = tab;
    track("project_tab_viewed", { project_id: id, tab });
  }, [project, tab, id]);

  const onTab = useCallback((next: ProjectTab) => {
    setTab(next);
    setOpened(list => list.includes(next) ? list : [...list, next]);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    url.searchParams.delete("block");
    window.history.replaceState(null, "", url);
  }, []);

  // A finished upload changes the map, the pack list and the reader.
  const { reload: reloadReader } = reader;
  const settled = useCallback(() => { reloadProject(); reloadReader(); }, [reloadProject, reloadReader]);
  const closeSheet = useCallback(() => setSheet(null), []);

  const openSession = useCallback((sessionId: string) => {
    setOpenFailed(false);
    resumeSession(sessionId).then(() => window.location.assign("/"), () => setOpenFailed(true));
  }, []);

  const view = project ? <ProjectView project={project} tab={tab} onTab={onTab}
    sessions={sessions} onOpenSession={openSession} openFailed={openFailed}
    onNewSession={() => void fresh.leave(`/?${new URLSearchParams({ project: id })}`, true)} newFailed={fresh.failed}
    reader={{ pages: reader.data, failed: reader.error !== null }} block={block}
    onLearnMore={text => void learn.leave(`/?${new URLSearchParams({ q: text, via: "pack_learn_more", project: id })}`, false)} learnFailed={learn.failed} onUploaded={setSheet} />
    : <div className={styles.page}>{error && <p className={styles.error} role="alert">{error === "missing" ? copy.projectNotFound : copy.projectLoadFailed}</p>}</div>;

  return <>
    <Shell work={view} layer={null} floatingPanels showCornerActions={!desktop} inert={side.drawerOpen && !desktop}
    sidebar={<Sidebar side={side} progress={{ active: false }} awayFromHome activeProjectId={id} refreshKey={`project-${id}`}
      onNewProblem={() => void fresh.leave("/", true)} onOpenSession={openSession} />}
    side={desktop ? side.mode : undefined} />
    {sheet && <PackSheet initial={sheet} onClose={closeSheet} onSettled={settled} />}
  </>;
}
