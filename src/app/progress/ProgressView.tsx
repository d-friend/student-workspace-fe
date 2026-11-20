import { IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { PanelActions } from "@/components/Shell";
import { useDesktop } from "@/hooks/useDesktop";
import type { ProgressItem, TreeResponse } from "@/lib/api";
import { copy } from "@/lib/copy";
import { openProgressSession, progressCards, progressDateLabel } from "@/lib/progress";
import { track } from "@/lib/track";
import { nodeCounts, nodeWorkspaces } from "@/lib/tree";
import { MdInline } from "@/workspace/md";
import { KnowledgeTree } from "@/workspace/KnowledgeTree";
import { ProgressCardCompact } from "@/workspace/ProgressCardCompact";
import styles from "./ProgressPage.module.css";

type Props = { items: ProgressItem[]; tree: TreeResponse | null; ready: boolean; failed: boolean; onRetry: () => void; newFailed: boolean };

// The content of the work area: the mind map with a filtered activity list beside it (desktop) or under it (phone).
export function ProgressView({ items, tree, ready, failed, onRetry, newFailed }: Props) {
  const desktop = useDesktop();
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedNode = tree?.nodes.find(node => node.id === selected) ?? null;
  const hasTree = !!tree && tree.nodes.length > 0;
  const scoped = useMemo(() => selectedNode && tree ? nodeWorkspaces(tree.nodes, tree.workspaces, selectedNode.id) : null, [selectedNode, tree]);
  const inside = useMemo(() => scoped && new Set(scoped.map(ws => ws.workspace_id)), [scoped]);
  const cards = useMemo(() => progressCards(items).filter(item => !inside || inside.has(item.workspace_id)), [items, inside]);
  const learned = useMemo(() => items.filter(item => item.phase === "learn" && item.quizzes && (!inside || inside.has(item.workspace_id))), [items, inside]);
  // Everything else in the selected subtree (a learn without quizzes, an unfinished solve) still shows, as plain rows, so the list matches the node's counts.
  const rest = useMemo(() => {
    const shown = new Set([...cards, ...learned].map(item => item.workspace_id));
    return scoped?.filter(ws => !shown.has(ws.workspace_id)) ?? [];
  }, [scoped, cards, learned]);
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

  const select = (nodeId: string | null) => {
    setSelected(nodeId);
    if (nodeId !== null && !desktop) listRef.current?.scrollIntoView?.({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  const open = (item: Pick<ProgressItem, "workspace_id" | "session_id" | "created_at"> & { tabs?: number }) => {
    if (!selectedNode) return void openProgressSession(item, "/");
    track("tree_workspace_opened", { node_id: selectedNode.id, workspace_id: item.workspace_id }, item.session_id);
    void openProgressSession(item, "/", item.workspace_id);
  };

  const activity = <>
    {selectedNode && <div className={styles.viewing}>
      <div className={styles.viewingText}>
        <strong>{copy.treeViewing(selectedNode.name)}</strong>
        <span className={styles.viewingCounts}>{nodeCounts(selectedNode).join(" · ")}</span>
      </div>
      <button type="button" className={styles.clear} aria-label={copy.treeClear} onClick={() => select(null)}><IconX size={18} aria-hidden="true" /></button>
    </div>}
    {groups.map(([title, group], index) => <section key={title} aria-labelledby={`${id}-group-${index}`}>
      <h2 id={`${id}-group-${index}`} className={styles.group}>{title}</h2>
      <div className={styles.list}>
        {group.map(item => <ProgressCardCompact key={item.workspace_id} item={item} variant="page" onOpen={() => open(item)} />)}
      </div>
    </section>)}
    {learned.length > 0 && <section aria-labelledby={`${id}-learned`}>
      <h2 id={`${id}-learned`} className={styles.group}>{copy.progressLearned}</h2>
      <div className={styles.learned}>
        {learned.map(item => <button key={item.workspace_id} type="button" className={styles.learnRow} onClick={() => open(item)}>
          <span className={styles.learnTitle}><MdInline text={item.title} /></span>{" "}
          <span className={styles.learnMeta}>
            <span className={styles.quizChip} data-hint={item.quizzes!.first_try < item.quizzes!.total || undefined}>{copy.progressQuizCount(item.quizzes!.first_try, item.quizzes!.total)}</span>{" "}
            <time dateTime={item.created_at}>{progressDateLabel(item.created_at)}</time>
          </span>
        </button>)}
      </div>
    </section>}
    {rest.length > 0 && <section aria-labelledby={`${id}-rest`}>
      <h2 id={`${id}-rest`} className={styles.group}>{copy.treeRest}</h2>
      <div className={styles.learned}>
        {rest.map(ws => <button key={ws.workspace_id} type="button" className={styles.learnRow} onClick={() => open(ws)}>
          <span className={styles.learnTitle}><MdInline text={ws.title} /></span>{" "}
          <span className={styles.learnMeta}>
            <span>{copy.treeKind[ws.phase]}</span>
            {ws.phase !== "learn" && ws.finished === false && <span className={styles.wip}>{copy.treeInProgress}</span>}
            <time dateTime={ws.created_at}>{progressDateLabel(ws.created_at)}</time>
          </span>
        </button>)}
      </div>
    </section>}
    {selectedNode && cards.length === 0 && learned.length === 0 && rest.length === 0 && <p className={styles.none}>{copy.treeNoneHere}</p>}
  </>;
  const header = <header>
    <h1 className={styles.title}>{copy.progressTitle}</h1>
    <p className={styles.subtitle}>{copy.progressSubtitle}</p>
  </header>;

  if (ready && !failed && hasTree) {
    const map = <KnowledgeTree data={tree} selected={selectedNode?.id ?? null} onSelect={select} />;
    // Two floating panels on the desk from 800px: the map in the centre, the activity list on the right.
    if (desktop) return <>
      <div className={styles.treePanel} data-shell-panel>
        <PanelActions />
        <div className={styles.treeHead}>{header}</div>
        <div className={styles.treeBox}>{map}</div>
      </div>
      <div className={styles.sidePanel} data-shell-panel><div className={styles.sideContent}>{activity}</div></div>
    </>;
    return <div className={styles.page}>
      <div className={styles.content}>
        {header}
        <div className={styles.phoneTree}>{map}</div>
        <div ref={listRef} className={styles.phoneList}>{activity}</div>
      </div>
    </div>;
  }

  const page = <div className={styles.page} aria-busy={!ready}>
    <div className={styles.content}>
      {header}
      {newFailed && <p className={styles.error} role="alert">{copy.progressNewFailed}</p>}
      {ready && (failed ? <div className={styles.state}>
        <p role="alert">{copy.progressError}</p>
        <button type="button" className={styles.action} onClick={onRetry}>{copy.progressRetry}</button>
      </div> : <>
        {activity}
        {cards.length === 0 && learned.length === 0 && <div className={styles.state}>
          <p>{copy.progressEmpty}</p>
          <Link className={styles.action} href="/">{copy.progressBack}</Link>
        </div>}
      </>)}
    </div>
  </div>;
  return desktop ? <div className={styles.panel} data-shell-panel><PanelActions /><div className={styles.scroll}>{page}</div></div> : page;
}
