import { copy } from "@/lib/copy";
import { BlockBoundary } from "./BlockBoundary";
import { renderBlock } from "./blocks";
import { PhaseSwitch } from "./PhaseSwitch";
import type { BlockCtx, Phase, Workspace } from "./types";
import styles from "./WorkspaceView.module.css";

const ORDER: Phase[] = ["learn", "solve", "practice"];

export function WorkspaceView({
  workspaces,
  phase,
  onPhase,
  makeCtx,
}: {
  workspaces: Partial<Record<Phase, Workspace>>;
  phase: Phase;
  onPhase: (p: Phase) => void;
  makeCtx: (w: Workspace) => BlockCtx;
}) {
  const present = ORDER.filter((p) => workspaces[p]);
  return (
    <div className={styles.view}>
      <PhaseSwitch phases={present} phase={phase} onPhase={onPhase} />
      {present.map((p) => {
        const w = workspaces[p]!;
        const ctx = makeCtx(w);
        return (
          <section
            key={w.id}
            id={`panel-${p}`}
            role="tabpanel"
            aria-labelledby={`tab-${p}`}
            hidden={p !== phase}
            className={styles.doc}
          >
            <h1 className={styles.title}>{w.doc.title}</h1>
            {w.doc.blocks.map((b) => (
              <BlockBoundary key={b.id} blockId={b.id} report={ctx.report}>
                {renderBlock(b, ctx)}
              </BlockBoundary>
            ))}
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
          </section>
        );
      })}
    </div>
  );
}
