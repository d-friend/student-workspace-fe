import { useEffect, useMemo, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { BlockBoundary } from "./BlockBoundary";
import { renderBlock } from "./blocks";
import { DoneBanner } from "./DoneBanner";
import { HelpBar } from "./HelpBar";
import { PhaseSwitch } from "./PhaseSwitch";
import type { BlockCtx, Phase, Workspace } from "./types";
import styles from "./WorkspaceView.module.css";

const ORDER: Phase[] = ["learn", "solve", "practice"];

type Props = {
  workspaces: Partial<Record<Phase, Workspace>>;
  phase: Phase;
  onPhase: (p: Phase) => void;
  makeCtx: (w: Workspace) => BlockCtx;
  taskDone?: Record<string, string[]>; // master completions (SSE task_done), by workspace id
};

function Doc({ w, p, hidden, base, onPhase, hasSolve, taskDone }: {
  w: Workspace;
  p: Phase;
  hidden: boolean;
  base: BlockCtx;
  onPhase: (p: Phase) => void;
  hasSolve: boolean;
  taskDone: string[];
}) {
  const [presses, setPresses] = useState(0);
  const [solved, setSolved] = useState<{ via?: "master" } | null>(null);
  const reported = useRef(false);
  const level = Math.min(presses, 3);
  const stepsIds = w.doc.blocks.filter((b) => b.type === "steps").map((b) => b.id);
  const stepsId = stepsIds[0] ?? "";
  const mastered = stepsIds.some((id) => taskDone.includes(id));
  const fin = useMemo(() => solved ?? (mastered ? { via: "master" as const } : null), [solved, mastered]);

  useEffect(() => {
    if (!fin || reported.current) return;
    reported.current = true;
    base.report("task_completed", { similar: p === "practice", helped: presses > 0, max_hint: level, ...(fin.via && { via: fin.via }) });
  }, [fin, base, p, presses, level]);

  const ctx: BlockCtx = {
    ...base,
    hintCount: presses,
    onSolved: (id) => {
      base.onSolved(id);
      setSolved((f) => f ?? {});
    },
  };
  const working = p !== "learn";

  return (
    <section id={`panel-${p}`} role="tabpanel" aria-labelledby={`tab-${p}`} hidden={hidden} className={styles.doc}>
      <h1 className={styles.title}>{w.doc.title}</h1>
      {w.doc.blocks.map((b) => (
        <BlockBoundary key={b.id} blockId={b.id} report={ctx.report}>
          {renderBlock(b, ctx)}
        </BlockBoundary>
      ))}
      {working && (
        <HelpBar
          level={level}
          onHint={() => {
            setPresses(presses + 1);
            ctx.report("help_requested", { block_id: stepsId, level: Math.min(presses + 1, 3) });
          }}
          onIdea={p === "solve" ? () => ctx.report("foundation_requested", {}) : undefined}
        />
      )}
      {fin && <DoneBanner />}
      {p === "learn" && w.doc.sources.length > 0 && (
        <aside className={styles.sources}>
          <h2>{copy.sources}</h2>
          <ul>
            {w.doc.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}
      {p === "learn" && hasSolve && (
        <button
          type="button"
          className={styles.back}
          onClick={() => {
            ctx.report("foundation_done", {});
            onPhase("solve");
          }}
        >
          {copy.backToProblem}
        </button>
      )}
    </section>
  );
}

export function WorkspaceView({ workspaces, phase, onPhase, makeCtx, taskDone = {} }: Props) {
  const present = ORDER.filter((p) => workspaces[p]);
  return (
    <div className={styles.view}>
      <PhaseSwitch phases={present} phase={phase} onPhase={onPhase} />
      {present.map((p) => {
        const w = workspaces[p]!;
        return (
          <Doc key={w.id} w={w} p={p} hidden={p !== phase} base={makeCtx(w)} onPhase={onPhase} hasSolve={!!workspaces.solve} taskDone={taskDone[w.id] ?? []} />
        );
      })}
    </div>
  );
}
