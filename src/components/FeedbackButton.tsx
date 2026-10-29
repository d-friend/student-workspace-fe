"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { IconMessageReport } from "@tabler/icons-react";
import { sendFeedback } from "@/lib/api";
import { copy } from "@/lib/copy";
import styles from "./FeedbackButton.module.css";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const sheet = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    setState("idle");
  };

  // Only one corner sheet at a time: they share a spot.
  useEffect(() => {
    const other = (event: Event) => { if ((event as CustomEvent).detail !== "feedback") setOpen(false); };
    window.addEventListener("df-sheet-open", other);
    return () => window.removeEventListener("df-sheet-open", other);
  }, []);
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent("df-sheet-open", { detail: "feedback" }));
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!sheet.current?.contains(target) && !trigger.current?.contains(target)) close();
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setState("sending");
    try {
      await sendFeedback(text.trim());
      setText("");
      setState("sent");
    } catch {
      setState("failed");
    }
  };

  return (
    <>
      <button ref={trigger} type="button" className={styles.open} aria-label={copy.feedbackOpen} onClick={() => (open ? close() : setOpen(true))}>
        <IconMessageReport size={20} aria-hidden="true" />
      </button>
      {open && (
        <form ref={sheet} className={styles.sheet} onSubmit={submit} aria-label={copy.feedbackTitle}>
          <h2>{copy.feedbackTitle}</h2>
          {state === "sent" ? (
            <>
              <p role="status">{copy.feedbackThanks}</p>
              <div className={styles.actions}><button type="button" onClick={close}>{copy.drawerClose}</button></div>
            </>
          ) : (
            <>
              <p>{copy.feedbackHint}</p>
              <textarea value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} aria-label={copy.feedbackHint} />
              {state === "failed" && <p className={styles.error} role="alert">{copy.feedbackFailed}</p>}
              <div className={styles.actions}>
                <button type="button" onClick={close}>{copy.feedbackCancel}</button>
                <button type="submit" disabled={state === "sending" || !text.trim()}>{copy.feedbackSend}</button>
              </div>
            </>
          )}
        </form>
      )}
    </>
  );
}
