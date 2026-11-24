import { IconChevronRight } from "@tabler/icons-react";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import type { MapItem } from "@/lib/api";
import { copy } from "@/lib/copy";
import { masteryRate } from "@/lib/projectMap";
import { nodeFill } from "@/lib/tree";
import styles from "./Project.module.css";

// A phone's version of the map: chapter > lesson > concept > detail as a vertical list that folds. Tapping a name selects the node,
// and `panel` (its notes) opens right under the row. Chapters start open, so the lessons show without a tap.
export function ProjectOutline({ map, selected, onSelect, panel }: { map: MapItem[]; selected: string | null; onSelect: (id: string) => void; panel: ReactNode }) {
  const { roots, kids } = useMemo(() => {
    const ids = new Set(map.map(n => n.id));
    const kids = new Map<string | null, MapItem[]>();
    for (const n of [...map].sort((a, b) => a.ordinal - b.ordinal)) {
      const parent = n.parent_id !== null && ids.has(n.parent_id) ? n.parent_id : null; // an orphan is a top-level row, not a lost one
      kids.set(parent, [...(kids.get(parent) ?? []), n]);
    }
    return { roots: kids.get(null) ?? [], kids };
  }, [map]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(roots.filter(n => n.role === "chapter").map(n => n.id)));
  const toggle = (id: string) => setOpen(prev => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; });

  const rows = (items: MapItem[]) => <ul className={styles.outlineList}>
    {items.map(n => {
      const children = kids.get(n.id) ?? [];
      const fill = nodeFill(masteryRate(n.mastery));
      const isOpen = open.has(n.id);
      return <li key={n.id} className={styles.outlineItem} data-role={n.role}>
        <div className={styles.outlineRow}>
          {children.length > 0
            ? <button type="button" className={styles.outlineToggle} aria-label={copy.treeToggle(n.name)} aria-expanded={isOpen} onClick={() => toggle(n.id)}>
              <IconChevronRight size={18} aria-hidden="true" />
            </button>
            : <span className={styles.outlineToggle} aria-hidden="true" />}
          <button type="button" className={styles.outlineName} aria-current={selected === n.id || undefined} onClick={() => onSelect(n.id)}>
            <span className={styles.outlineDot} data-hollow={fill === null || undefined} style={fill === null ? undefined : { "--fill": `${fill}%` } as CSSProperties} aria-hidden="true" />
            <span>{n.name}</span>
          </button>
        </div>
        {selected === n.id && panel}
        {isOpen && children.length > 0 && rows(children)}
      </li>;
    })}
  </ul>;

  return <nav aria-label={copy.projectOutlineLabel}>{rows(roots)}</nav>;
}
