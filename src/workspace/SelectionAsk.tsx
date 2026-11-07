import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useCopy } from "./WorkspaceCopy";
import styles from "./SelectionAsk.module.css";

export type SelectionQuote = { text: string; where: string; block_id: string; item?: number };
type Candidate = { quote: SelectionQuote; left: number; bottom: number };

export function SelectionAsk({ scroller, activeId, onAsk }: { scroller: RefObject<HTMLDivElement | null>; activeId: string; onAsk?: (quote: SelectionQuote) => void }) {
  const copy = useCopy();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => { clearTimeout(timer); setCandidate(null); };
    const change = () => {
      clearTimeout(timer);
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) { setCandidate(null); return; }
      timer = setTimeout(() => {
        const selection = window.getSelection();
        const root = scroller.current;
        if (!selection || selection.isCollapsed || !selection.rangeCount || !root || !onAsk) { setCandidate(null); return; }
        const text = selection.toString().trim();
        const range = selection.getRangeAt(0);
        const element = (node: Node) => node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
        const start = element(range.startContainer);
        const end = element(range.endContainer);
        const panel = document.getElementById(`panel-${activeId}`);
        const marker = start?.closest<HTMLElement>("[data-sel]");
        const block = start?.closest<HTMLElement>("[data-block-id]");
        const excluded = "[data-action-bar], input, textarea, iframe, [contenteditable='true']";
        // shortcut: tap = answer, long-press selection too risky on mobile.
        const coarseOption = marker?.dataset.sel === "option" && window.matchMedia("(pointer: coarse)").matches;
        const intersectsExcluded = typeof range.intersectsNode === "function" && Array.from(panel?.querySelectorAll(excluded) ?? []).some((node) => range.intersectsNode(node));
        if (text.length < 2 || text.length > 300 || !panel || !root.contains(panel) || panel.hidden || !start || !end || !panel.contains(start) || !panel.contains(end) || start.closest(excluded) || end.closest(excluded) || intersectsExcluded || !marker || marker !== end.closest("[data-sel]") || !block || block !== end.closest("[data-block-id]") || coarseOption) { setCandidate(null); return; }
        const rects = range.getClientRects();
        const rect = rects[rects.length - 1];
        if (!rect) { setCandidate(null); return; }
        const item = marker.closest<HTMLElement>("[data-item]")?.dataset.item;
        setCandidate({ quote: { text: text.slice(0, 300), where: marker.dataset.sel!, block_id: block.dataset.blockId!, ...((marker.dataset.sel === "prompt" || marker.dataset.sel === "option") && item !== undefined ? { item: Number(item) } : {}) }, left: rect.left, bottom: rect.bottom });
      }, 250);
    };
    const tap = (event: PointerEvent) => { if (!button.current?.contains(event.target as Node)) hide(); };
    document.addEventListener("selectionchange", change);
    document.addEventListener("pointerdown", tap);
    window.addEventListener("scroll", hide, true);
    return () => { clearTimeout(timer); document.removeEventListener("selectionchange", change); document.removeEventListener("pointerdown", tap); window.removeEventListener("scroll", hide, true); };
  }, [scroller, activeId, onAsk]);

  useLayoutEffect(() => {
    if (!candidate || !button.current) return;
    const { width, height } = button.current.getBoundingClientRect();
    setPosition({ left: Math.max(0, Math.min(candidate.left, window.innerWidth - width)), top: Math.max(0, Math.min(candidate.bottom + 6, window.innerHeight - height)) });
  }, [candidate]);

  if (!candidate) return null;
  return createPortal(<button ref={button} type="button" className={styles.button} style={{ left: position.left, top: position.top }} onClick={() => { onAsk?.(candidate.quote); setCandidate(null); }}>{copy.selectionAsk}</button>, document.body);
}
