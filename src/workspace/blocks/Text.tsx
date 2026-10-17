import { Md } from "../md";
import type { Block, BlockProps } from "../types";
import styles from "./blocks.module.css";

export function Text({ block }: BlockProps<Extract<Block, { type: "text" }>>) {
  return (
    <div className={styles.prose}>
      <Md text={block.md} />
    </div>
  );
}
