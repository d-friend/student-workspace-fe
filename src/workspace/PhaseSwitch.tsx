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
    const strip = row.current;
    const selected = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!strip || !selected) return;
    if (window.matchMedia?.("(min-width: 800px)").matches) {
      // Revealing a tab must preserve the workspace's restored vertical position.
      const bounds = strip.getBoundingClientRect();
      const tab = selected.getBoundingClientRect();
      if (tab.left < bounds.left) strip.scrollLeft += tab.left - bounds.left;
      else if (tab.right > bounds.right) strip.scrollLeft += tab.right - bounds.right;
      return;
    }
    selected.scrollIntoView?.({ block: "nearest", inline: "nearest" });
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
