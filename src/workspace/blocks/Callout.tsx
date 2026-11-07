import { IconAlertTriangle, IconBookmark, IconBulb } from "@tabler/icons-react";
import { useCopy } from "../WorkspaceCopy";
import { Md } from "../md";
import type { Block, BlockProps } from "../types";
import styles from "./blocks.module.css";

const TONES = { idea: IconBulb, remember: IconBookmark, warning: IconAlertTriangle };

export function Callout({ block }: BlockProps<Extract<Block, { type: "callout" }>>) {
  const copy = useCopy();
  const Icon = TONES[block.tone];
  const label = { idea: copy.calloutIdea, remember: copy.calloutRemember, warning: copy.calloutWarning }[block.tone];
  return (
    <aside className={`${styles.card} ${block.tone === "idea" ? styles.idea : ""}`}>
      <p className={styles.label}>
        <Icon size={20} stroke={2} aria-hidden="true" />
        {label}
      </p>
      <div className={styles.prose}>
        <Md text={block.md} />
      </div>
    </aside>
  );
}
