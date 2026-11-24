import { IconArrowLeft } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanelActions } from "@/components/Shell";
import { useDesktop, useNarrow } from "@/hooks/useDesktop";
import type { ProjectSessions } from "@/hooks/useProjectSessions";
import { NodePanel } from "@/components/pack/NodePanel";
import type { Pack, Project, ReaderPage } from "@/lib/api";
import { copy } from "@/lib/copy";
import { mapAsTree, type ProjectScreen } from "@/lib/projectMap";
import { KnowledgeTree } from "@/workspace/KnowledgeTree";
import { ProjectOutline } from "./ProjectOutline";
import { ProjectOverview } from "./ProjectOverview";
import { ProjectReader } from "./ProjectReader";
import styles from "./Project.module.css";

export type ProjectViewProps = {
  project: Project;
  screen: ProjectScreen;
  onOpen: (screen: "map" | "sources") => void; // from the overview; the page pushes history so back returns to it
  onBack: () => void; // "← subject": back to the overview
  sessions: ProjectSessions;
  onOpenSession: (id: string) => void;
  openFailed: boolean;
  onSend: (text: string, photos: string[]) => Promise<boolean>;
  sendError: string | null;
  reader: { pages: ReaderPage[] | null; failed: boolean };
  block: string | null; // the passage the reader scrolls to and marks
  onLearnMore: (text: string) => void;
  learnFailed: boolean;
  onViewSource: (blockId: string) => void; // "Xem nguồn" on a map node: open the reader at that passage
  onUploaded: (pack: Pack) => void; // "Thêm": the page owns the status sheet
};

// A subject page: the overview (start a session, notes and map rows, recent sessions), or the map or the notes reader as a full page of their own.
// Pure on its props, so a fixture page can draw it with no backend.
export function ProjectView(props: ProjectViewProps) {
  const { project, screen } = props;
  const desktop = useDesktop();
  const narrow = useNarrow();
  const [selected, setSelected] = useState<string | null>(null);
  const tree = useMemo(() => mapAsTree(project.map), [project.map]);
  const selectedNode = project.map.find(n => n.id === selected) ?? null;
  const panel = useRef<HTMLDivElement>(null);
  // On a phone the panel sits under the map (or under its row, in the outline): bring it into view when a node is picked.
  useEffect(() => {
    if (selected && !desktop) panel.current?.scrollIntoView?.({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: narrow ? "nearest" : "start" });
  }, [selected, desktop, narrow]);

  const photos = project.packs.reduce((sum, pack) => sum + (pack.photos ?? 0), 0);
  const counts = [
    props.sessions.ready && props.sessions.sessions.length > 0 ? copy.projectCountSessions(props.sessions.sessions.length, props.sessions.hasMore) : null,
    photos > 0 ? copy.projectCountPhotos(photos) : null,
  ].filter(Boolean).join(" · ");

  const overview = screen === "overview";
  // The title lives in the top bar: on desktop in the panel header, on a phone in a band behind the menu, feedback and theme buttons.
  // Desktop also shows the counts there, muted; a phone has no room, so they open the content instead.
  const bar = overview
    ? <div className={styles.barTitle}>
      <h1 className={styles.barName}>{project.name}</h1>
      {desktop && counts && <span className={styles.barMeta}>{counts}</span>}
    </div>
    : <div className={styles.barTitle}>
      <button type="button" className={styles.back} aria-label={copy.projectBack(project.name)} onClick={props.onBack}>
        <IconArrowLeft size={18} aria-hidden="true" /><span>{project.name}</span>
      </button>
      <h1 className={styles.barName}>{screen === "map" ? copy.projectMapRow : copy.projectNotesRow}</h1>
    </div>;

  const nodePanel = selectedNode && <div ref={panel} className={styles.nodePanel}>
    <NodePanel node={selectedNode} onViewSource={props.onViewSource} onLearnMore={props.onLearnMore} learnFailed={props.learnFailed} onClose={() => setSelected(null)} />
  </div>;
  const body = <div className={styles.body} data-screen={screen}>
    {overview && <>
      {!desktop && counts && <p className={styles.summary}>{counts}</p>}
      <ProjectOverview project={project} sessions={props.sessions} onOpenSession={props.onOpenSession} openFailed={props.openFailed}
        onSend={props.onSend} sendError={props.sendError} onUploaded={props.onUploaded} onOpen={props.onOpen} />
    </>}
    {screen === "map" && (project.map.length
      ? narrow
        ? <ProjectOutline map={project.map} selected={selected} onSelect={setSelected} panel={nodePanel} />
        : <div className={styles.mapLayout}>
          <div className={styles.mapBox}><KnowledgeTree data={tree} selected={selected} onSelect={setSelected} rootLabel={project.name} trackClicks={false} /></div>
          {nodePanel}
        </div>
      : <p className={styles.empty}>{copy.projectMapEmpty}</p>)}
    {screen === "sources" && <ProjectReader projectName={project.name} packs={project.packs} pages={props.reader.pages} failed={props.reader.failed} block={props.block}
      onLearnMore={props.onLearnMore} learnFailed={props.learnFailed} />}
  </div>;

  if (desktop) return <div className={styles.panel} data-shell-panel>
    <PanelActions flush>{bar}</PanelActions>
    {body}
  </div>;
  return <div className={styles.page}><div className={styles.topBand}>{bar}</div>{body}</div>;
}
