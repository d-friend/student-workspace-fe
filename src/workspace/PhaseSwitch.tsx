import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconAlertCircle, IconBook, IconChecklist, IconCircleCheck, IconCircleDashed, IconPencil, IconSchool } from "@tabler/icons-react";
import { Spin } from "@/components/Skeleton";
import type { QueueItem, QueueStatus } from "@/lib/api";
import { copy } from "@/lib/copy";
import type { Phase, Workspace } from "./types";
import styles from "./PhaseSwitch.module.css";

const icons = { learn: IconBook, solve: IconPencil, practice: IconSchool, review: IconChecklist };

// A word and an icon, never colour alone.
export function QueueStatusIcon({ status, size = 18 }: { status: QueueStatus; size?: number }) {
  if (status === "building") return <Spin size={size} />;
  const Icon = status === "ready" ? IconCircleCheck : status === "failed" ? IconAlertCircle : IconCircleDashed;
  return <Icon size={size} stroke={1.8} aria-hidden="true" />;
}

export type QueueTabs = { items: QueueItem[]; viewId: string | null; onOpen: (itemId: string, from: "tab" | "card") => void };

export function PhaseSwitch({ tabs, activeId, onActive, barTarget, queue }: {
  queue?: QueueTabs;
  tabs: (Workspace & { phase: Phase })[];
  activeId: string;
  onActive: (id: string) => void;
  // Desktop with the chat hidden: the tabs live in the panel's top bar instead of above the doc.
  barTarget?: HTMLElement | null;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false); // tabs hidden past the right edge
  const measure = () => {
    const strip = row.current;
    setMore(!!strip && strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
  };
  useEffect(() => {
    measure();
    const strip = row.current;
    if (!strip || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
  });
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
  }, [activeId, queue?.viewId, queue?.items.length, tabs.length]);

  const items = queue?.items ?? [];
  // Built tabs first, then the page's other problems in page order.
  const own = tabs.filter((w) => !items.some((i) => i.workspaceId === w.id));
  const viewing = queue?.viewId ?? null;
  if (own.length + items.length <= 1) return null;
  const strip = (
    <div ref={row} className={styles.bar} role="tablist" data-in-bar={barTarget ? "" : undefined} data-more={more || undefined} onScroll={measure}>
      {own.map((w) => {
        const Icon = icons[w.phase];
        // The problem built first goes by its page number like the queued ones; its title stays in the doc header.
        const number = items.find((i) => i.firstWorkspaceId === w.id)?.firstLabel;
        return (
          <button
            key={w.id}
            type="button"
            role="tab"
            id={`tab-${w.id}`}
            aria-selected={viewing === null && w.id === activeId}
            aria-controls={`panel-${w.id}`}
            className={styles.seg}
            data-numbered={number ? "" : undefined}
            title={w.doc.title}
            onClick={() => onActive(w.id)}
          >
            <Icon size={18} stroke={1.8} aria-hidden="true" />
            <span className={number ? styles.label : styles.title}>{number ?? w.doc.title}</span>
          </button>
        );
      })}
      {items.map((item) => {
        const tab = tabs.find((w) => w.id === item.workspaceId);
        const selected = viewing === null ? tab !== undefined && tab.id === activeId : viewing === item.id;
        // An opened problem is an ordinary tab; the status is for the ones still waiting.
        const waiting = !(item.status === "ready" && item.opened);
        const Icon = tab ? icons[tab.phase] : IconPencil;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={tab ? `tab-${tab.id}` : `tab-queue-${item.id}`}
            aria-selected={selected}
            aria-controls={tab ? `panel-${tab.id}` : `panel-queue-${item.id}`}
            className={styles.seg}
            data-queue={waiting ? item.status : undefined}
            title={tab?.doc.title}
            onClick={() => queue!.onOpen(item.id, "tab")}
          >
            {waiting ? <QueueStatusIcon status={item.status} /> : <Icon size={18} stroke={1.8} aria-hidden="true" />}
            <span className={styles.label}>{item.label}</span>
            {waiting && <>{" "}<span className={styles.status}>{copy.queueStatus[item.status]}</span></>}
          </button>
        );
      })}
    </div>
  );
  return barTarget ? createPortal(strip, barTarget) : strip;
}
