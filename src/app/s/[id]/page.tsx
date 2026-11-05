"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, openSharedWorkspace, resumeSession } from "@/lib/api";
import styles from "./page.module.css";

const requests = new Map<string, Promise<{ sessionId: string }>>();

export default function SharedPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<"loading" | "missing" | "not-ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    // Reuse the creation request across mounts and when resume needs a retry.
    let creation = requests.get(id);
    if (!creation) {
      creation = openSharedWorkspace(id);
      requests.set(id, creation);
      const created = creation;
      void created.catch(() => {
        if (requests.get(id) === created) requests.delete(id);
      });
    }
    void (async () => {
      try {
        const { sessionId } = await creation;
        if (!active) return;
        await resumeSession(sessionId);
        // As with the history sidebar, resume selects the server's current session; home restores it.
        if (active) window.location.replace("/");
      } catch (error) {
        if (active) setState(error instanceof ApiError && error.status === 404 ? "missing" : error instanceof ApiError && error.status === 409 && error.code === "workspace_not_ready" ? "not-ready" : "error");
      }
    })();
    return () => { active = false; };
  }, [id, attempt]);

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        {state === "loading" ? <p role="status">Đang mở bài…</p> : state === "missing" ? (
          <>
            <h1>Không tìm thấy bài được chia sẻ</h1>
            <p>Liên kết này không còn khả dụng.</p>
            <Link className={styles.action} href="/">Bắt đầu</Link>
          </>
        ) : (
          <>
            <h1>Chưa thể mở bài</h1>
            <p role="alert">{state === "not-ready" ? "Bài này chưa dựng xong, hãy thử lại sau" : "Bạn thử lại nhé."}</p>
            <button type="button" className={styles.action} onClick={() => {
              setState("loading");
              setAttempt((value) => value + 1);
            }}>Thử lại</button>
          </>
        )}
      </div>
    </main>
  );
}
