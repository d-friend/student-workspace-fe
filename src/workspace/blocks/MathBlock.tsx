import { TeX } from "../TeX";
import type { Block, BlockProps } from "../types";
import styles from "./blocks.module.css";

export function MathBlock({ block }: BlockProps<Extract<Block, { type: "math" }>>) {
  return (
    <div className={styles.math}>
      <TeX tex={block.tex} display />
    </div>
  );
}
