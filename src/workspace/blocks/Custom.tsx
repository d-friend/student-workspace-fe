import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { WorkspaceFrame } from "@/components/work/WorkspaceFrame";
import { copy } from "@/lib/copy";
import { customFrames, frameDoc } from "@/lib/frame";
import type { Block, BlockProps } from "../types";
import styles from "./blocks.module.css";

type CustomBlock = Extract<Block, { type: "custom" }>;

// AI-written HTML in the sandboxed bridge iframe; its events reach the workspace queue via customFrames.
export function Custom({ block, ctx }: BlockProps<CustomBlock>) {
  const ref = useRef<HTMLIFrameElement>(null);
  // Empty on the server, so render never reads location.
  const origin = useSyncExternalStore(() => () => {}, () => location.origin, () => "");
  const version = ctx.simulationVersions?.[`${ctx.workspaceId}:${block.id}`] ?? 0;
  const [fit, setFit] = useState<number | null>(null);
  // The frame reports its content height, so a model that picked too small a height cannot cut off the controls.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const h = e.data?.dfriendHeight;
      if (e.source === ref.current?.contentWindow && Number.isFinite(h)) setFit(Math.ceil(h));
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, [version]);
  useEffect(() => {
    const win = ref.current?.contentWindow;
    if (!win) return;
    customFrames.add(win);
    return () => void customFrames.delete(win);
  }, [version, block.html]);
  if (block.html === null) {
    return ctx.simulationPending?.[`${ctx.workspaceId}:${block.id}`] && !ctx.simulationFailures?.[`${ctx.workspaceId}:${block.id}`] ? (
      <div aria-busy="true" style={{ minHeight: 360, display: "grid", placeItems: "center", color: "var(--muted)" }}>
        <span>{copy.simulationBuilding}</span>
      </div>
    ) : <p className={styles.failed}>{copy.simulationFailed}</p>;
  }
  return <WorkspaceFrame key={version} srcDoc={frameDoc(block.html, origin)} iframeRef={ref} height={fit ?? block.height ?? undefined} />;
}
