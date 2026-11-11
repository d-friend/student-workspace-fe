"use client";

import Link from "next/link";
import { ProfileGate } from "@/components/ProfileGate";
import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, getSheet, nameSheet, openSheetItem, resumeSession, type SheetView } from "@/lib/api";
import { copy } from "@/lib/copy";
import styles from "../s/[id]/page.module.css";
import formStyles from "./SheetPage.module.css";

export function SheetPage() {
  const { id } = useParams<{ id: string }>();
  return <ProfileGate hold><SheetEntry key={id} id={id} /></ProfileGate>;
}

function SheetEntry({ id }: { id: string }) {
  const [sheet, setSheet] = useState<SheetView | null>(null);
  const [state, setState] = useState<"loading" | "name" | "opening" | "missing" | "load-error" | "open-error" | "not-ready">("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [openAttempt, setOpenAttempt] = useState(0);
  const [name, setName] = useState("");
  const [nameFailed, setNameFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const naming = useRef(false);
  // Share the open request across Strict Mode effect replays and retries of resume.
  // This cache belongs to this visit, so a later visit can choose a new unfinished item.
  const requests = useRef(new Map<number, Promise<{ sessionId: string }>>());

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await getSheet(id);
        if (!active) return;
        setSheet(loaded);
        setState(loaded.named ? "opening" : "name");
      } catch (error) {
        if (active) setState(error instanceof ApiError && error.status === 404 ? "missing" : "load-error");
      }
    })();
    return () => { active = false; };
  }, [id, loadAttempt]);

  useEffect(() => {
    if (!sheet?.named) return;
    let active = true;
    void (async () => {
      let opened = false;
      try {
        const target = sheet.items.find((item) => item.state !== "done") ?? sheet.items[0];
        if (!target) throw new Error("sheet has no items");
        let opening = requests.current.get(target.position);
        if (!opening) {
          opening = openSheetItem(id, target.position);
          requests.current.set(target.position, opening);
          const request = opening;
          void request.catch(() => {
            if (requests.current.get(target.position) === request) requests.current.delete(target.position);
          });
        }
        const { sessionId } = await opening;
        opened = true;
        if (!active) return;
        await resumeSession(sessionId);
        // Resume selects the server's current session; home restores it, as on SharedPage.
        if (active) window.location.replace("/");
      } catch (error) {
        if (!active) return;
        if (!opened && error instanceof ApiError && error.status === 409 && error.code === "name_required") {
          setSheet({ ...sheet, named: false });
          setState("name");
        } else {
          setState(!opened && error instanceof ApiError && error.status === 409 && error.code === "workspace_not_ready" ? "not-ready" : "open-error");
        }
      }
    })();
    return () => { active = false; };
  }, [id, sheet, openAttempt, requests]);

  const submitName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !sheet || naming.current) return;
    naming.current = true;
    setSaving(true);
    setNameFailed(false);
    try {
      await nameSheet(id, trimmed);
      setState("opening");
      setSheet({ ...sheet, named: true });
    } catch {
      setNameFailed(true);
    } finally {
      naming.current = false;
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        {state === "loading" || state === "opening" ? <p role="status">{copy.sheetOpening}</p> : state === "missing" ? (
          <>
            <h1>{copy.sheetMissingTitle}</h1>
            <p>{copy.sheetMissingBody}</p>
            <Link className={styles.action} href="/">{copy.sheetStart}</Link>
          </>
        ) : state === "name" ? (
          <>
            <h1>{sheet?.title}</h1>
            <form className={formStyles.form} onSubmit={(event) => void submitName(event)}>
              <label htmlFor="sheet-name">{copy.sheetNameLabel}</label>
              <input id="sheet-name" type="text" maxLength={60} autoComplete="name" aria-describedby="sheet-name-note" value={name} onChange={(event) => setName(event.target.value)} />
              <p id="sheet-name-note">{copy.sheetNameNote}</p>
              {nameFailed && <p role="alert">{copy.sheetNameFailed}</p>}
              <button className={styles.action} type="submit" disabled={saving}>{copy.sheetStart}</button>
            </form>
          </>
        ) : (
          <>
            <h1>{copy.sheetErrorTitle}</h1>
            <p role="alert">{state === "not-ready" ? copy.sheetNotReady : copy.sheetRetryHint}</p>
            <button className={styles.action} type="button" onClick={() => {
              if (state === "load-error") {
                setState("loading");
                setLoadAttempt((value) => value + 1);
              } else {
                setState("opening");
                setOpenAttempt((value) => value + 1);
              }
            }}>{copy.sheetRetry}</button>
          </>
        )}
      </div>
    </main>
  );
}
