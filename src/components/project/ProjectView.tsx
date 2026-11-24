import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { PanelActions } from "@/components/Shell";
import { useDesktop, useNarrow } from "@/hooks/useDesktop";
import type { ProjectSessions } from "@/hooks/useProjectSessions";
import { NodePanel } from "@/components/pack/NodePanel";
import { PackUpload } from "@/components/pack/PackUpload";
import type { Pack, Project, ReaderPage } from "@/lib/api";
import { copy } from "@/lib/copy";
import { mapAsTree, TABS, type ProjectTab } from "@/lib/projectMap";
import { KnowledgeTree } from "@/workspace/KnowledgeTree";
import { ProjectOutline } from "./ProjectOutline";
import { ProjectReader } from "./ProjectReader";
import { ProjectSessionList } from "./ProjectSessionList";
import styles from "./Project.module.css";

export type ProjectViewProps = {
  project: Project;
  tab: ProjectTab;
  onTab: (tab: ProjectTab) => void;
  sessions: ProjectSessions;
  onOpenSession: (id: string) => void;
  openFailed: boolean;
  onNewSession: () => void;
  newFailed: boolean;
  reader: { pages: ReaderPage[] | null; failed: boolean };
  block: string | null; // the passage the reader scrolls to and marks
  onLearnMore: (text: string) => void;
  learnFailed: boolean;
  onViewSource: (blockId: string) => void; // "Xem nguồn" on a map node: open the reader at that passage
  onUploaded: (pack: Pack) => void; // "Cập nhật vở": the page owns the status sheet
};

// A subject project: its name, then three tabs (Bản đồ, Phiên học, Nguồn). Pure on its props, so a fixture page can draw it with no backend.
export function ProjectView(props: ProjectViewProps) {
  const { project, tab, onTab } = props;
  const desktop = useDesktop();
  const narrow = useNarrow();
  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const tree = useMemo(() => mapAsTree(project.map), [project.map]);
  const selectedNode = project.map.find(n => n.id === selected) ?? null;
  const panel = useRef<HTMLDivElement>(null);
  // On a phone the panel sits under the map (or under its row, in the outline): bring it into view when a node is picked.
  useEffect(() => {
    if (selected && !desktop) panel.current?.scrollIntoView?.({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: narrow ? "nearest" : "start" });
  }, [selected, desktop, narrow]);

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    onTab(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  };

  const header = <div className={styles.head}>
    <h1 className={styles.title}>{project.name}</h1>
    <PackUpload projectId={project.id} onUploaded={props.onUploaded} />
  </div>;
  const tabs = <div role="tablist" aria-label={copy.projectTabsLabel} className={styles.tabs} onKeyDown={onKeyDown}>
    {TABS.map(t => <button key={t} type="button" role="tab" id={`${id}-tab-${t}`} className={styles.tab}
      aria-selected={tab === t} aria-controls={`${id}-panel`} tabIndex={tab === t ? 0 : -1} onClick={() => onTab(t)}>{copy.projectTabs[t]}</button>)}
  </div>;
  const nodePanel = selectedNode && <div ref={panel} className={styles.nodePanel}>
    <NodePanel node={selectedNode} onViewSource={props.onViewSource} onLearnMore={props.onLearnMore} learnFailed={props.learnFailed} onClose={() => setSelected(null)} />
  </div>;
  const body = <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`} className={styles.body} data-tab={tab}>
    {tab === "map" && (project.map.length
      ? narrow
        ? <ProjectOutline map={project.map} selected={selected} onSelect={setSelected} panel={nodePanel} />
        : <div className={styles.mapLayout}>
          <div className={styles.mapBox}><KnowledgeTree data={tree} selected={selected} onSelect={setSelected} rootLabel={project.name} trackClicks={false} /></div>
          {nodePanel}
        </div>
      : <p className={styles.empty}>{copy.projectMapEmpty}</p>)}
    {tab === "sessions" && <ProjectSessionList sessions={props.sessions} onOpen={props.onOpenSession} openFailed={props.openFailed}
      onNew={props.onNewSession} newFailed={props.newFailed} />}
    {tab === "sources" && <ProjectReader projectName={project.name} packs={project.packs} pages={props.reader.pages} failed={props.reader.failed} block={props.block}
      onLearnMore={props.onLearnMore} learnFailed={props.learnFailed} />}
  </div>;

  if (desktop) return <div className={styles.panel} data-shell-panel>
    <PanelActions>{header}</PanelActions>
    {tabs}
    {body}
  </div>;
  return <div className={styles.page}><div className={styles.topBand} aria-hidden="true" />{header}{tabs}{body}</div>;
}
