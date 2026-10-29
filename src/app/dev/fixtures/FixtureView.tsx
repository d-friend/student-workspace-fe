"use client";

import { useState } from "react";
import { Shell } from "@/components/Shell";
import type { BlockCtx, WorkspaceDoc } from "@/workspace/types";
import { WorkspaceView } from "@/workspace/WorkspaceView";
import styles from "../../page.module.css";

const noop = () => {};

export function FixtureView({ doc }: { doc: WorkspaceDoc }) {
  const [activeId, setActive] = useState("fx");
  const w = { id: "fx", doc };
  const makeCtx = (): BlockCtx => ({
    workspaceId: "fx",
    phase: doc.phase,
    report: noop,
    check: async () => ({ ok: true, state: "ok", done: false }),
    overrides: {},
    hintCount: 0,
    onSolved: noop,
    help: null,
  });
  return (
    <Shell
      layer={null}
      work={
        <div className={styles.viewWrap}>
          <WorkspaceView tabs={[{ ...w, phase: doc.phase }]} activeId={activeId} onActive={setActive} makeCtx={makeCtx} />
        </div>
      }
    />
  );
}
