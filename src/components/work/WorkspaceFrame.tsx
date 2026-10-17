import type { Ref } from "react";
import { copy } from "@/lib/copy";
import { StatusPill } from "./StatusPill";
import styles from "./WorkspaceFrame.module.css";

// The legacy workspace, in a sandboxed iframe. `status` is the pill label while a build is running.
export function WorkspaceFrame({
  srcDoc,
  status,
  iframeRef,
}: {
  srcDoc: string;
  status: string | null;
  iframeRef?: Ref<HTMLIFrameElement>;
}) {
  return (
    <div className={styles.wrap}>
      <iframe
        ref={iframeRef}
        title={copy.workspaceTitle}
        sandbox="allow-scripts allow-forms"
        srcDoc={srcDoc}
        className={styles.frame}
      />
      {status !== null && <StatusPill>{status}</StatusPill>}
    </div>
  );
}
