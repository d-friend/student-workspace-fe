import { useEffect, useRef } from "react";
import { IconBook, IconPencil, IconSchool } from "@tabler/icons-react";
import type { Phase, Workspace } from "./types";
import styles from "./PhaseSwitch.module.css";

const icons = { learn: IconBook, solve: IconPencil, practice: IconSchool };

export function PhaseSwitch({ tabs, activeId, onActive }: {
  tabs: (Workspace & { phase: Phase })[];
  activeId: string;
  onActive: (id: string) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    row.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  if (tabs.length <= 1) return null;
  return (
    <div ref={row} className={styles.bar} role="tablist">
      {tabs.map((w) => {
        const Icon = icons[w.phase];
        return (
          <button
            key={w.id}
            type="button"
            role="tab"
            id={`tab-${w.id}`}
            aria-selected={w.id === activeId}
            aria-controls={`panel-${w.id}`}
            className={styles.seg}
            title={w.doc.title}
            onClick={() => onActive(w.id)}
          >
            <Icon size={18} stroke={1.8} aria-hidden="true" />
            <span className={styles.title}>{w.doc.title}</span>
          </button>
        );
      })}
    </div>
  );
}
