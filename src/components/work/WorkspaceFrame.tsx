import type { Ref } from "react";
import { copy } from "@/lib/copy";
import { StatusPill } from "./StatusPill";
import styles from "./WorkspaceFrame.module.css";

// The agent's workspace, in a sandboxed iframe. `building` shows the pill while an html block is still open.
export function WorkspaceFrame({
  srcDoc,
  building,
  iframeRef,
}: {
  srcDoc: string;
  building: boolean;
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
      {building && <StatusPill>{copy.building}</StatusPill>}
    </div>
  );
}
