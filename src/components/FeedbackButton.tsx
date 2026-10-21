"use client";

import { FormEvent, useState } from "react";
import { IconMessageReport } from "@tabler/icons-react";
import { sendFeedback } from "@/lib/api";
import { copy } from "@/lib/copy";
import styles from "./FeedbackButton.module.css";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const close = () => {
    setOpen(false);
    setState("idle");
  };

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
      <button type="button" className={styles.open} aria-label={copy.feedbackOpen} onClick={() => (open ? close() : setOpen(true))}>
        <IconMessageReport size={20} aria-hidden="true" />
      </button>
      {open && (
        <form className={styles.sheet} onSubmit={submit} aria-label={copy.feedbackTitle}>
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
