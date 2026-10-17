import { useEffect, useRef, useSyncExternalStore } from "react";
import { WorkspaceFrame } from "@/components/work/WorkspaceFrame";
import { customFrames, frameDoc } from "@/lib/frame";
import type { Block, BlockProps } from "../types";

type CustomBlock = Extract<Block, { type: "custom" }>;

// AI-written HTML in the sandboxed bridge iframe; its events reach the workspace queue via customFrames.
export function Custom({ block }: BlockProps<CustomBlock>) {
  const ref = useRef<HTMLIFrameElement>(null);
  // Empty on the server, so render never reads location.
  const origin = useSyncExternalStore(() => () => {}, () => location.origin, () => "");
  useEffect(() => {
    const win = ref.current?.contentWindow;
    if (!win) return;
    customFrames.add(win);
    return () => void customFrames.delete(win);
  }, []);
  return <WorkspaceFrame srcDoc={frameDoc(block.html, origin)} status={null} iframeRef={ref} height={block.height} />;
}
