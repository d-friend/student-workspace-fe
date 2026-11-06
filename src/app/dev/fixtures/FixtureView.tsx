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
    check: async (blockId, answer, _previous, item) => {
      const block = doc.blocks.find((b) => b.type === "steps" && b.id === blockId);
      if (block?.type !== "steps" || block.roadmap !== "motion_current" || item === undefined) return { ok: true, state: "ok", done: false };
      const current = block.scaffold?.[item];
      const done = item === (block.scaffold?.length ?? 0) - 1;
      return { ok: true, state: "ok", done, ...(current?.kind === "choice" && { line: current.options[Number(answer)] }), ...(done && { takeaway: "Dùng quan hệ thời gian để lập phương trình chuyển động." }) };
    },
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
