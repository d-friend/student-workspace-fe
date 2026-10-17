import { IconAlertTriangle, IconBookmark, IconBulb } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import { Md } from "../md";
import type { Block, BlockProps } from "../types";
import styles from "./blocks.module.css";

const TONES = {
  idea: { Icon: IconBulb, label: copy.calloutIdea },
  remember: { Icon: IconBookmark, label: copy.calloutRemember },
  warning: { Icon: IconAlertTriangle, label: copy.calloutWarning },
};

export function Callout({ block }: BlockProps<Extract<Block, { type: "callout" }>>) {
  const { Icon, label } = TONES[block.tone];
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
