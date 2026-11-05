"use client";

import { useEffect, useState } from "react";
import { IconShare } from "@tabler/icons-react";
import { shareWorkspace } from "@/lib/share";
import styles from "./ShareButton.module.css";

export function ShareButton({ workspaceId, title, disabled = false }: { workspaceId: string; title: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 2500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const share = async () => {
    setBusy(true);
    setFeedback("");
    try {
      const result = await shareWorkspace(window.location.origin, workspaceId, title, navigator);
      if (result === "copied") setFeedback("Đã sao chép liên kết");
    } catch {
      setFeedback("Chưa thể chia sẻ. Bạn thử lại nhé.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.button} disabled={busy || disabled} title={disabled ? "Mô phỏng đang được dựng" : undefined} onClick={() => void share()}>
        <IconShare size={18} stroke={1.8} aria-hidden="true" />
        Chia sẻ
      </button>
      <span role="status" className={styles.feedback}>{feedback}</span>
    </div>
  );
}
