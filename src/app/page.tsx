"use client";

import { type ChangeEvent, useMemo, useRef } from "react";
import { Shell } from "@/components/Shell";
import { Bubble } from "@/components/rail/Bubble";
import { ChatLog } from "@/components/rail/ChatLog";
import { Composer } from "@/components/rail/Composer";
import { OfferChips } from "@/components/rail/OfferChips";
import { RailHeader } from "@/components/rail/RailHeader";
import { RestateChips } from "@/components/rail/RestateChips";
import { WatchingCue } from "@/components/rail/WatchingCue";
import { BuildingSkeleton } from "@/components/work/BuildingSkeleton";
import { EmptyState } from "@/components/work/EmptyState";
import { PhotoCheck } from "@/components/work/PhotoCheck";
import { StatusPill } from "@/components/work/StatusPill";
import { WorkspaceFrame } from "@/components/work/WorkspaceFrame";
import { useWorkspace } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";
import { frameDoc } from "@/lib/frame";
import type { BlockCtx, Workspace } from "@/workspace/types";
import { WorkspaceView } from "@/workspace/WorkspaceView";
import styles from "./page.module.css";

const JPEG_PREFIX = "data:image/jpeg;base64,";

type PhotoSource = "snap_button" | "composer_button" | "retake";

export default function Page() {
  const ws = useWorkspace();
  const fileInput = useRef<HTMLInputElement>(null);
  const source = useRef<PhotoSource>("snap_button");

  const pick = (from: PhotoSource) => {
    source.current = from;
    fileInput.current?.click();
  };
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void ws.pickPhoto(file, source.current);
  };

  // html is null on the server and on the first client render, so location is only read in the browser.
  const srcDoc = useMemo(() => (ws.html === null ? null : frameDoc(ws.html, location.origin)), [ws.html]);
  const photoSrc = ws.photo === null ? null : JPEG_PREFIX + ws.photo;

  const lastAgent = ws.bubbles.findLast((b) => b.kind === "agent");

  const rail = (
    <>
      <RailHeader showNewProblem={ws.hasMessages} onNewProblem={ws.newProblem} />
      <ChatLog empty={ws.bubbles.length === 0} tick={ws.bubbles}>
        {ws.bubbles.map((b) => {
          if (b.kind === "student") {
            return (
              <Bubble key={b.id} variant="student">
                {b.photo && (
                  // eslint-disable-next-line @next/next/no-img-element -- base64 data URL, next/image cannot optimize it
                  <img src={JPEG_PREFIX + b.photo} alt={copy.photoChip} style={{ maxWidth: "100%", borderRadius: 8 }} />
                )}
                {b.text}
              </Bubble>
            );
          }
          if (b.kind !== "agent") {
            return (
              <Bubble key={b.id} variant={b.kind}>
                {b.text}
              </Bubble>
            );
          }
          const muted = b.id !== lastAgent?.id;
          return (
            <div key={b.id} style={{ display: "contents" }}>
              {b.line === null ? (
                <Bubble variant="agent" muted={muted}>
                  {b.text}
                </Bubble>
              ) : (
                <Bubble variant="agent-review" line={b.line} muted={muted}>
                  {b.text}
                </Bubble>
              )}
              {!muted && ws.restateChips && <RestateChips onConfirm={ws.confirmRestate} onCorrect={ws.correctRestate} />}
              {!muted && ws.offerChips && (
                <OfferChips onAccept={() => void ws.answerOffer(true)} onLater={() => void ws.answerOffer(false)} />
              )}
            </div>
          );
        })}
        {ws.watching && <WatchingCue />}
      </ChatLog>
      <Composer
        value={ws.input}
        onChange={ws.setInput}
        onSend={() => void ws.submit()}
        onPickPhoto={() => pick("composer_button")}
        placeholder={ws.hasMessages ? copy.placeholderWorking : copy.placeholderEmpty}
        sendDisabled={ws.sendDisabled}
        photo={photoSrc ? { src: photoSrc, onRemove: ws.removePhoto } : null}
        inputRef={ws.inputRef}
      />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} />
    </>
  );

  const pill = ws.building ? (ws.status ?? copy.building) : null;
  // WorkspaceView wraps hintCount and onSolved per doc itself.
  const makeCtx = (w: Workspace): BlockCtx => ({
    workspaceId: w.id,
    phase: w.doc.phase,
    report: ws.report,
    check: (blockId, answer, previous) => ws.check(w.id, blockId, answer, previous),
    overrides: ws.overrides[w.id] ?? {},
    hintCount: 0,
    onSolved: () => {},
  });

  let work;
  if (ws.phase !== null) {
    work = (
      // The pill sits on the non-scrolling wrapper, so it stays pinned while the doc (WorkspaceView's scroller) scrolls.
      <div className={styles.viewWrap}>
        <WorkspaceView
          workspaces={ws.workspaces}
          phase={ws.phase}
          onPhase={ws.setPhase}
          makeCtx={makeCtx}
          taskDone={ws.taskDone}
        />
        {pill !== null && <StatusPill>{pill}</StatusPill>}
      </div>
    );
  } else if (srcDoc !== null) {
    work = <WorkspaceFrame srcDoc={srcDoc} status={pill} iframeRef={ws.frameRef} />;
  } else if (ws.screen === "building") {
    work = (
      <BuildingSkeleton status={pill ?? copy.thinking} variant={ws.buildingPhase === "learn" ? "learn" : "solve"} />
    );
  } else if (photoSrc) {
    work = (
      <PhotoCheck
        src={photoSrc}
        onSend={() => void ws.submit()}
        onRetake={() => {
          ws.retake();
          pick("retake");
        }}
      />
    );
  } else {
    work = (
      <EmptyState
        onSnap={() => pick("snap_button")}
        onType={ws.typeProblemClicked}
        onStarter={(s) => void ws.startStarter(s)}
        onRetry={ws.buildFailed ? () => void ws.rebuild() : undefined}
      />
    );
  }

  return <Shell rail={rail} work={work} />;
}
