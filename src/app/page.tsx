"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { PetLayer } from "@/components/pet/PetLayer";
import { NewProblemButton } from "@/components/rail/NewProblemButton";
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

type PhotoSource = "snap_button" | "composer_button" | "retake" | "paste" | "drop";

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

  // A pasted screenshot becomes the photo, wherever the focus is. Pasted text is left to the browser.
  const { pickPhoto } = ws;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      void pickPhoto(file, "paste");
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [pickPhoto]);

  // A dragged image (e.g. the macOS screenshot thumbnail) becomes the photo, wherever it lands.
  // dragover must be cancelled, or the browser opens the image instead of firing drop.
  useEffect(() => {
    const hasImage = (e: DragEvent) => Array.from(e.dataTransfer?.items ?? []).some((i) => i.type.startsWith("image/"));
    const onDragOver = (e: DragEvent) => {
      if (hasImage(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      void pickPhoto(file, "drop");
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [pickPhoto]);

  // html is null on the server and on the first client render, so location is only read in the browser.
  const srcDoc = useMemo(() => (ws.html === null ? null : frameDoc(ws.html, location.origin)), [ws.html]);
  const photoSrc = ws.photo === null ? null : JPEG_PREFIX + ws.photo;

  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const layer = (
    <PetLayer
      state={ws}
      inputRef={ws.inputRef}
      onOpenChange={setDrawerOpen}
      onNewProblem={ws.newProblem}
      onConfirmRestate={ws.confirmRestate}
      onCorrectRestate={ws.correctRestate}
      onAcceptOffer={() => void ws.answerOffer(true)}
      onOfferLater={() => void ws.answerOffer(false)}
      composer={{
        value: ws.input,
        onChange: ws.setInput,
        onSend: () => void ws.submit(),
        onPickPhoto: () => pick("composer_button"),
        placeholder: ws.hasMessages ? copy.placeholderWorking : copy.placeholderEmpty,
        sendDisabled: ws.sendDisabled,
        photo: photoSrc ? { src: photoSrc, onRemove: ws.removePhoto } : null,
      }}
    />
  );
  const bar = ws.hasMessages && (
    <div className={styles.topBar}>
      <NewProblemButton onClick={ws.newProblem} />
    </div>
  );

  return (
    <>
      <Shell bar={bar} work={work} layer={layer} inert={drawerOpen} />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} />
    </>
  );
}
