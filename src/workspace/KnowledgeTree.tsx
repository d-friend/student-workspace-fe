import { useId, useMemo, useState, type CSSProperties } from "react";
import { IconChevronRight } from "@tabler/icons-react";
import type { TreeResponse, TreeWorkspace } from "@/lib/api";
import { copy } from "@/lib/copy";
import { progressDateLabel } from "@/lib/progress";
import { track } from "@/lib/track";
import { nodeCounts, nodeFill, nodeWorkspaces, treeRows, type TreeRow } from "@/lib/tree";
import { MdInline } from "./md";
import styles from "./KnowledgeTree.module.css";

type Props = { data: TreeResponse; onOpenWorkspace: (workspace: TreeWorkspace) => void };

export function KnowledgeTree({ data, onOpenWorkspace }: Props) {
  const rows = useMemo(() => treeRows(data.nodes), [data.nodes]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const prefix = useId();

  const toggle = (id: string) => setCollapsed(prev => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; });
  const tap = (row: TreeRow) => {
    track("tree_node_clicked", { node_id: row.node.id, level: row.node.level });
    setOpenId(openId === row.node.id ? null : row.node.id);
  };
  const open = (nodeId: string, workspace: TreeWorkspace) => {
    track("tree_workspace_opened", { node_id: nodeId, workspace_id: workspace.workspace_id }, workspace.session_id);
    onOpenWorkspace(workspace);
  };

  const renderRows = (list: TreeRow[]) => <ul className={styles.rows}>
    {list.map(row => {
      const { node } = row;
      const fill = nodeFill(node.rate);
      const isOpen = openId === node.id;
      const isCollapsed = collapsed.has(node.id);
      const listId = `${prefix}-${node.id}`;
      const workspaces = isOpen ? nodeWorkspaces(data.nodes, data.workspaces, node.id) : [];
      return <li key={node.id}>
        <div className={styles.row}>
          {row.children.length > 0
            ? <button type="button" className={styles.chevron} aria-expanded={!isCollapsed} aria-label={copy.treeToggle(node.name)} onClick={() => toggle(node.id)}>
              <IconChevronRight size={18} aria-hidden="true" className={styles.chevronIcon} />
            </button>
            : <span className={styles.chevronSpace} aria-hidden="true" />}
          <button type="button" className={styles.body} data-level={node.level} aria-expanded={isOpen} aria-controls={isOpen ? listId : undefined} onClick={() => tap(row)}>
            <span className={styles.dot} data-hollow={fill === null || undefined} style={fill === null ? undefined : { "--fill": `${fill}%` } as CSSProperties} aria-hidden="true" />
            <span className={styles.name}>{node.name}</span>
            {node.grades.length > 0 && <span className={styles.grade}>{copy.treeGrade(node.grades)}</span>}
            <span className={styles.counts}>{nodeCounts(node).join(" · ")}</span>
          </button>
        </div>
        {isOpen && <ul id={listId} className={styles.workspaces} aria-label={copy.treeList(node.name)}>
          {workspaces.map(ws => <li key={ws.workspace_id}>
            <button type="button" className={styles.workspace} onClick={() => open(node.id, ws)}>
              <span className={styles.wsTitle}><MdInline text={ws.title} /></span>
              <span className={styles.wsMeta}>
                <span>{copy.treeKind[ws.phase]}</span>
                {ws.phase !== "learn" && ws.finished === false && <span className={styles.wip}>{copy.treeInProgress}</span>}
                <time dateTime={ws.created_at}>{progressDateLabel(ws.created_at)}</time>
              </span>
            </button>
          </li>)}
        </ul>}
        {row.children.length > 0 && !isCollapsed && renderRows(row.children)}
      </li>;
    })}
  </ul>;

  return <section aria-labelledby={`${prefix}-title`} className={styles.tree}>
    <h2 id={`${prefix}-title`} className={styles.title}>{copy.treeTitle}</h2>
    <p className={styles.hint}>{copy.treeHint}</p>
    {renderRows(rows)}
  </section>;
}
