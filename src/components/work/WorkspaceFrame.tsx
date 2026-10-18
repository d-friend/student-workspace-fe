import type { Ref } from "react";
import { copy } from "@/lib/copy";
import { postTheme } from "@/lib/theme";
import styles from "./WorkspaceFrame.module.css";

// The legacy workspace, in a sandboxed iframe.
export function WorkspaceFrame({
  srcDoc,
  iframeRef,
  height,
}: {
  srcDoc: string;
  iframeRef?: Ref<HTMLIFrameElement>;
  height?: number;
}) {
  return (
    <div className={styles.wrap}>
      <iframe
        ref={iframeRef}
        title={copy.workspaceTitle}
        sandbox="allow-scripts allow-forms"
        srcDoc={srcDoc}
        onLoad={(e) => postTheme(e.currentTarget.contentWindow)}
        style={height === undefined ? undefined : { height }}
        className={styles.frame}
      />
    </div>
  );
}
