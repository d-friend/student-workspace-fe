"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { setFeatureEmails } from "@/lib/api";
import { copy } from "@/lib/copy";
import styles from "./FeatureEmailPrompt.module.css";

export function FeatureEmailPrompt({ onClose }: { onClose: () => void }) {
  const [checked, setChecked] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  const finish = (on: boolean) => {
    if (submitted.current) return;
    submitted.current = true;
    onClose();
    void setFeatureEmails(on).catch(() => {});
  };

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); finish(false); return; }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)") ?? []);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  };

  return <div className={styles.backdrop}>
    <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="feature-email-title" onKeyDown={trapFocus}>
      <h2 id="feature-email-title">{copy.featureEmailTitle}</h2>
      <label className={styles.option}>
        <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        <span>{copy.featureEmailLabel}</span>
      </label>
      <button type="button" onClick={() => finish(checked)}>{copy.featureEmailDone}</button>
    </div>
  </div>;
}
