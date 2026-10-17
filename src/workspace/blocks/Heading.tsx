import { MdInline } from "../md";
import type { BlockProps, Block } from "../types";
import styles from "./blocks.module.css";

export function Heading({ block }: BlockProps<Extract<Block, { type: "heading" }>>) {
  const Tag = block.level === 2 ? "h2" : "h3";
  return <Tag className={block.level === 2 ? styles.h2 : styles.h3}><MdInline text={block.text} /></Tag>;
}
