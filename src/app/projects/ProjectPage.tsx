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
import { useProject, useReader, useReviewDue } from "@/hooks/useProject";
import { useProjectSessions } from "@/hooks/useProjectSessions";
import { type Pack, resumeSession } from "@/lib/api";
import { copy } from "@/lib/copy";
import { discardHandoffPhotos, stashHandoffPhotos } from "@/lib/photo";
import { screenOf, trackedTab, type ProjectScreen } from "@/lib/projectMap";
import { reviewUrl } from "@/lib/review";
import { track } from "@/lib/track";
import styles from "@/components/project/Project.module.css";

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  return <ProfileGate><Suspense><ProjectContent key={id} id={id} /></Suspense></ProfileGate>;
}

function ProjectContent({ id }: { id: string }) {
  const query = useSearchParams(); // Next keeps it in step with pushState and the back gesture
  const { data: project, error, reload: reloadProject } = useProject(id);
  const screen = screenOf(query.get("tab"));
  const block = screen === "sources" ? query.get("block") : null; // set by "Xem nguồn"; the reader scrolls to it
  const [readerWanted, setReaderWanted] = useState(screen === "sources"); // the reader loads the first time it is opened: it is the heaviest call
  const [openFailed, setOpenFailed] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Pack | null>(null); // the upload status sheet
  const sessions = useProjectSessions(id, true);
  const reader = useReader(id, readerWanted);
  const due = useReviewDue(id);
  const fresh = useLeaveSession();
  const learn = useLeaveSession();
  const review = useLeaveSession();
  const side = useSidebar();
  const desktop = useDesktop();
  const tracked = useRef<ProjectScreen | null>(null);

  // One project_tab_viewed per screen shown, the first one once the project has loaded.
  useEffect(() => {
    if (!project || tracked.current === screen) return;
    tracked.current = screen;
    track("project_tab_viewed", { project_id: id, tab: trackedTab(screen) });
  }, [project, screen, id]);

  // A new screen starts at its top, whatever the one before was scrolled to.
  useEffect(() => { document.querySelector("main")?.scrollTo?.(0, 0); }, [screen]);

  // Opening the map or the notes pushes a history entry, so the phone's back gesture and the browser's back button return to the overview.
  // `subjectDepth` counts the entries pushed since the first one; "← subject" goes back that many, so it lands on the overview even after map > Xem nguồn.
  // `subjectDeep` marks a first entry that was itself the map or the notes (a link, a reload): there is no overview behind it to go back to.
  const push = useCallback((next: "map" | "sources", blockId?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    url.searchParams.delete("via"); // it described how this entry was reached, not the next one
    if (blockId) url.searchParams.set("block", blockId); else url.searchParams.delete("block");
    const current = window.history.state;
    const deep = Boolean(current?.subjectDeep) || (screen !== "overview" && current?.subjectDepth === undefined);
    window.history.pushState({ subjectDepth: (current?.subjectDepth ?? 0) + 1, subjectDeep: deep }, "", url);
    if (next === "sources") setReaderWanted(true);
  }, [screen]);
  const back = useCallback(() => {
    const { subjectDepth: depth = 0, subjectDeep: deep = false } = window.history.state ?? {};
    if (depth > 0 && !deep) { window.history.go(-depth); return; }
    // No overview entry to go back to: show it by replacing this one.
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    url.searchParams.delete("block");
    url.searchParams.delete("via");
    window.history.replaceState(null, "", url);
  }, []);
  // "Xem nguồn" on a map node: open the notes at the passage the node came from.
  const viewSource = useCallback((blockId: string) => push("sources", blockId), [push]);

  // A finished upload changes the map, the pack list and the reader.
  const { reload: reloadReader } = reader;
  const settled = useCallback(() => { reloadProject(); reloadReader(); }, [reloadProject, reloadReader]);
  const closeSheet = useCallback(() => setSheet(null), []);

  const openSession = useCallback((sessionId: string) => {
    setOpenFailed(false);
    resumeSession(sessionId).then(() => window.location.assign("/"), () => setOpenFailed(true));
  }, []);

  // The composer's Gửi: the same path as Học thêm (end the open session, then a full page load of home), with the photos carried in sessionStorage.
  // If they cannot be stored, or ending fails, nothing navigates and the composer keeps what was typed.
  const send = useCallback(async (text: string, photos: string[]) => {
    setSendError(null);
    if (photos.length && !stashHandoffPhotos(photos)) { setSendError(copy.projectPhotoSaveFailed); return false; }
    const params = new URLSearchParams({ project: id });
    if (text) params.set("q", text);
    const navigating = await fresh.leave(`/?${params}`, true);
    if (!navigating) { discardHandoffPhotos(); setSendError(copy.projectNewFailed); }
    return navigating;
  }, [id, fresh]);

  // "Ôn tập môn này": a new session in the subject whose first message asks for a review (the same handoff as Học thêm).
  const startReview = useCallback(() => {
    if (project) void review.leave(reviewUrl(copy.reviewProjectMessage(project.name), "review", id), false);
  }, [id, project, review]);

  const view = project ? <ProjectView project={project} screen={screen} onOpen={push} onBack={back}
    sessions={sessions} onOpenSession={openSession} openFailed={openFailed} onSend={send} sendError={sendError}
    reader={{ pages: reader.data, failed: reader.error !== null }} block={block}
    onLearnMore={text => void learn.leave(`/?${new URLSearchParams({ q: text, via: "pack_learn_more", project: id })}`, false)} learnFailed={learn.failed} onViewSource={viewSource} onUploaded={setSheet}
    reviewDue={due.data ?? 0} onReview={startReview} reviewFailed={review.failed} />
    : <div className={styles.page}>{error && <p className={styles.error} role="alert">{error === "missing" ? copy.projectNotFound : copy.projectLoadFailed}</p>}</div>;

  return <>
    <Shell work={view} layer={null} floatingPanels showCornerActions={!desktop} inert={side.drawerOpen && !desktop}
    sidebar={<Sidebar side={side} progress={{ active: false }} awayFromHome activeProjectId={id} refreshKey={`project-${id}`}
      onNewProblem={() => void fresh.leave("/", true)} onOpenSession={openSession} />}
    side={desktop ? side.mode : undefined} />
    {sheet && <PackSheet initial={sheet} onClose={closeSheet} onSettled={settled} inProject />}
  </>;
}
