"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { getSheet, openSheetItem, resumeSession, type SheetRef, type SheetView } from "@/lib/api";
import { copy } from "@/lib/copy";
import styles from "./SheetSwitcher.module.css";

export function SheetSwitcher({ sheet, busy, beforeSwitch, onSwitched }: {
  sheet: SheetRef;
  busy: boolean;
  beforeSwitch: () => void;
  onSwitched: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SheetView | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  const [switching, setSwitching] = useState(false);
  const inFlight = useRef(false);
  const wrap = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const disabled = busy || switching;

  useEffect(() => {
    if (!open) return;
    let active = true;
    void getSheet(sheet.id).then((loaded) => {
      if (active) setView(loaded);
    }).catch(() => {
      if (active) setListFailed(true);
    });
    return () => { active = false; };
  }, [open, sheet.id]);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      toggle.current?.focus();
    };
    const outside = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("click", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("click", outside);
    };
  }, [open]);

  const switchTo = async (position: number) => {
    if (busy || inFlight.current || position < 1 || position > sheet.count || position === sheet.position) return;
    inFlight.current = true;
    setSwitching(true);
    setSwitchFailed(false);
    setOpen(false);
    try {
      beforeSwitch();
      const { sessionId } = await openSheetItem(sheet.id, position);
      await resumeSession(sessionId);
      onSwitched();
    } catch {
      setSwitchFailed(true);
    } finally {
      inFlight.current = false;
      setSwitching(false);
    }
  };

  return (
    <nav ref={wrap} className={styles.wrap} aria-label={copy.sheetNav}>
      <div className={styles.bar}>
        <button className={styles.arrow} type="button" aria-label={copy.sheetPrev} disabled={disabled || sheet.position === 1} onClick={() => void switchTo(sheet.position - 1)}>
          <IconArrowLeft size={20} stroke={1.8} aria-hidden="true" />
        </button>
        <button ref={toggle} className={styles.toggle} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => {
          if (!open) {
            setView(null);
            setListFailed(false);
          }
          setOpen(!open);
        }}>{copy.sheetPosition(sheet.position, sheet.count)}</button>
        <button className={styles.arrow} type="button" aria-label={copy.sheetNext} disabled={disabled || sheet.position === sheet.count} onClick={() => void switchTo(sheet.position + 1)}>
          <IconArrowRight size={20} stroke={1.8} aria-hidden="true" />
        </button>
      </div>
      {switchFailed && <p className={styles.feedback} role="alert">{copy.sheetSwitchFailed}</p>}
      {open && (
        <div id={panelId} className={styles.panel}>
          <div className={styles.header}>
            <strong>{view?.title ?? sheet.title}</strong>
            <button className={styles.close} type="button" onClick={() => { setOpen(false); toggle.current?.focus(); }}>{copy.sheetClose}</button>
          </div>
          {listFailed ? <p role="alert">{copy.sheetListFailed}</p> : view ? (
            <>
              <p className={styles.count}>{copy.sheetDoneCount(view.done, view.count)}</p>
              <ul className={styles.list} role="list">
                {view.items.map((item) => (
                  <li key={item.position}>
                    <button className={styles.item} type="button" aria-current={item.position === sheet.position ? "true" : undefined} disabled={item.position !== sheet.position && disabled} onClick={() => {
                      setOpen(false);
                      toggle.current?.focus();
                      if (item.position !== sheet.position) void switchTo(item.position);
                    }}>
                      <span className={styles.label}>{item.label}</span>
                      <span className={styles.firstLine}>{item.firstLine}</span>
                      <span className={styles.state}>{item.state === "done" ? copy.sheetStateDone : item.state === "started" ? copy.sheetStateStarted : copy.sheetStateNew}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : <p role="status">{copy.sheetOpening}</p>}
        </div>
      )}
    </nav>
  );
}
