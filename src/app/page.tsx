"use client";

import { type ChangeEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Entry } from "@/components/Entry";
import { Shell } from "@/components/Shell";
import { PetAnchorProvider } from "@/components/pet/PetAnchor";
import { PetLayer } from "@/components/pet/PetLayer";
import { NewProblemButton } from "@/components/rail/NewProblemButton";
import { BuildingSkeleton } from "@/components/work/BuildingSkeleton";
import { WorkspaceFrame } from "@/components/work/WorkspaceFrame";
import { useDesktop } from "@/hooks/useDesktop";
import { useUnfold } from "@/hooks/useUnfold";
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
  const entryInput = useRef<HTMLTextAreaElement>(null);
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
  const desktop = useDesktop();

  // WorkspaceView wraps hintCount and onSolved per doc itself.
  const makeCtx = (w: Workspace): BlockCtx => ({
    workspaceId: w.id,
    phase: w.doc.phase,
    report: ws.report,
    check: (blockId, answer, previous, item) => ws.check(w.id, blockId, answer, previous, item),
    overrides: ws.overrides[w.id] ?? {},
    hintCount: 0,
    onSolved: () => {},
    help: null,
  });

  // One composer at a time: the entry's until there is a conversation, then the drawer's.
  const composer = {
    value: ws.input,
    onChange: ws.setInput,
    onSend: () => void ws.submit(),
    onPickPhoto: () => pick("composer_button"),
    placeholder: ws.hasMessages ? copy.placeholderWorking : copy.placeholderEmpty,
    sendDisabled: ws.sendDisabled,
    photo: photoSrc ? { src: photoSrc, onRemove: ws.removePhoto } : null,
  };

  let stage;
  if (ws.phase !== null) {
    stage = (
      <div className={styles.viewWrap}>
        <WorkspaceView
          workspaces={ws.workspaces}
          phase={ws.phase}
          onPhase={ws.setPhase}
          makeCtx={makeCtx}
          taskDone={ws.taskDone}
        />
      </div>
    );
  } else if (srcDoc !== null) {
    stage = <WorkspaceFrame srcDoc={srcDoc} iframeRef={ws.frameRef} />;
  } else if (ws.screen === "building") {
    const firstSent = ws.bubbles.find((b) => b.kind === "student");
    stage = (
      <BuildingSkeleton
        variant={ws.buildingPhase === "learn" ? "learn" : "solve"}
        problem={firstSent?.kind === "student" ? firstSent.text : undefined}
      />
    );
  }
  const entry = stage === undefined;

  // The unfold (spec §6): for about a second after the first send the entry stays under the stage, fading out, while
  // the stage opens over it from the composer and a card carries the problem to the top of the doc column.
  const unfold = useUnfold(ws.screen, ws.phase !== null || ws.html !== null);
  const flying = unfold === "flying";
  // The store has already cleared the input and the photo; the problem is the first thing the student sent.
  const sent = ws.bubbles.find((b) => b.kind === "student");
  const sentPhoto = sent?.kind === "student" && sent.photo ? JPEG_PREFIX + sent.photo : null;
  const unfoldRef = useRef<HTMLDivElement>(null);

  // The fly card's start and end and the reveal's origin are measured, not taken from the design's one viewport.
  // Before paint: the entry is still laid out under the stage, and the skeleton has just mounted.
  useLayoutEffect(() => {
    const box = unfoldRef.current;
    if (!flying || !box) return;
    const o = box.getBoundingClientRect();
    const field = entryInput.current;
    const form = field?.closest("form");
    const from = form?.getBoundingClientRect() ?? new DOMRect(o.left + o.width / 2 - 160, o.top + o.height / 2, 320, 64);
    const stack = box.querySelector("[data-unfold-target]");
    const first = stack?.querySelector("[data-variant='solve'] [data-unfold-target] > :first-child");
    let to: DOMRect;
    if (stack) {
      const r = stack.getBoundingClientRect();
      to = new DOMRect(r.left, r.top, r.width, first?.getBoundingClientRect().height ?? 104);
    } else {
      const w = Math.min(624, o.width - 32);
      to = new DOMRect(o.left + (o.width - w) / 2, o.top + 72, w, 104);
    }
    const f = field?.getBoundingClientRect();
    const fieldStyle = field ? getComputedStyle(field) : null;
    const px = (n: number) => `${Math.round(n)}px`;
    const vars: Record<string, string> = {
      "--from-x": px(from.left - o.left),
      "--from-y": px(from.top - o.top),
      "--from-w": px(from.width),
      "--from-h": px(from.height),
      "--from-r": form ? getComputedStyle(form).borderRadius : "32px",
      // The card's text starts where the composer's text was.
      "--from-px": f && fieldStyle ? px(f.left - from.left + parseFloat(fieldStyle.paddingLeft)) : "28px",
      "--from-py": f && fieldStyle ? px(f.top - from.top + parseFloat(fieldStyle.paddingTop)) : "20px",
      "--to-x": px(to.left - o.left),
      "--to-y": px(to.top - o.top),
      "--to-w": px(to.width),
      "--to-h": px(to.height),
      "--reveal-x": px(from.left - o.left + from.width / 2),
      "--reveal-y": px(from.top - o.top + from.height / 2),
    };
    for (const [k, v] of Object.entries(vars)) box.style.setProperty(k, v);
  }, [flying]);

  const bar = ws.hasMessages && !entry && (
    <div className={styles.topBar}>
      <NewProblemButton onClick={ws.newProblem} />
    </div>
  );

  const work = (
    <div ref={unfoldRef} className={styles.unfold} data-unfold={unfold}>
      {(entry || flying) && (
        <Entry
          composer={composer}
          inputRef={entryInput}
          onStarter={(s) => void ws.startStarter(s)}
          onRetry={ws.buildFailed ? () => void ws.rebuild() : undefined}
          leaving={flying}
          photoCheck={
            photoSrc
              ? {
                  src: photoSrc,
                  onSend: () => void ws.submit(),
                  onRetake: () => {
                    ws.retake();
                    pick("retake");
                  },
                }
              : flying && sentPhoto
                ? { src: sentPhoto, onSend: () => {}, onRetake: () => {} } // fading out with the rest
                : null
          }
        />
      )}
      {/* The same element before, during and after the flight, so a doc that arrives mid-flight is not remounted. */}
      {stage !== undefined && (
        <div className={styles.stage}>
          {flying && bar}
          {stage}
        </div>
      )}
      {flying && sent?.kind === "student" && (
        <div className={styles.fly} aria-hidden="true">
          <div className={styles.flyIn}>
            <span className={styles.flyLabel}>{copy.problemLabel}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {sentPhoto && <img className={styles.flyPhoto} src={sentPhoto} alt="" />}
            {sent.text && <p className={styles.flyText}>{sent.text}</p>}
          </div>
        </div>
      )}
    </div>
  );

  const layer = (
    <PetLayer
      state={ws}
      inputRef={ws.inputRef}
      entry={entry}
      flying={flying}
      entryInputRef={entryInput}
      onOpenChange={setDrawerOpen}
      onChatOpened={ws.chatOpened}
      onNewProblem={ws.newProblem}
      onConfirmRestate={ws.confirmRestate}
      onCorrectRestate={ws.correctRestate}
      onAcceptOffer={() => void ws.answerOffer(true)}
      onOfferLater={() => void ws.answerOffer(false)}
      onOpt={(t) => void ws.answerOpt(t)}
      composer={composer}
    />
  );
  return (
    <PetAnchorProvider>
      <Shell bar={!flying && bar} work={work} layer={layer} chatOpen={drawerOpen} inert={drawerOpen && !desktop} />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} />
    </PetAnchorProvider>
  );
}
