"use client";

import { useState } from "react";
import { Shell } from "@/components/Shell";
import type { BlockCtx, Phase, WorkspaceDoc } from "@/workspace/types";
import { WorkspaceView } from "@/workspace/WorkspaceView";
import styles from "../../page.module.css";

const noop = () => {};

export function FixtureView({ doc }: { doc: WorkspaceDoc }) {
  const [phase, setPhase] = useState<Phase>(doc.phase);
  const w = { id: "fx", doc };
  const makeCtx = (): BlockCtx => ({
    workspaceId: "fx",
    phase: doc.phase,
    report: noop,
    check: async () => ({ ok: true, state: "ok", done: false }),
    overrides: {},
    hintCount: 0,
    onSolved: noop,
  });
  return (
    <Shell
      layer={null}
      work={
        <div className={styles.viewWrap}>
          <WorkspaceView workspaces={{ [doc.phase]: w }} phase={phase} onPhase={setPhase} makeCtx={makeCtx} />
        </div>
      }
    />
  );
}
