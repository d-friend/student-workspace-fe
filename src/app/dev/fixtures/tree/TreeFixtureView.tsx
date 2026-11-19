"use client";

import { PanelActions, Shell } from "@/components/Shell";
import { useDesktop } from "@/hooks/useDesktop";
import { copy } from "@/lib/copy";
import { KnowledgeTree } from "@/workspace/KnowledgeTree";
import styles from "../../../progress/ProgressPage.module.css";
import { treeFixture } from "./treeFixture";

export function TreeFixtureView() {
  const desktop = useDesktop();
  const page = <div className={styles.page}>
    <div className={styles.content}>
      <header>
        <h1 className={styles.title}>{copy.progressTitle}</h1>
        <p className={styles.subtitle}>{copy.progressSubtitle}</p>
      </header>
      <KnowledgeTree data={treeFixture} onOpenWorkspace={() => {}} />
    </div>
  </div>;
  const work = desktop ? <div className={styles.panel} data-shell-panel><PanelActions /><div className={styles.scroll}>{page}</div></div> : page;
  return <Shell work={work} layer={null} floatingPanels showCornerActions={!desktop} />;
}
