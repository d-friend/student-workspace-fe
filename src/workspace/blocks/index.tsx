import type { ReactNode } from "react";
import type { Block, BlockCtx } from "../types";
import { Callout } from "./Callout";
import { Example } from "./Example";
import { Heading } from "./Heading";
import { ImageBlock } from "./Image";
import { MathBlock } from "./MathBlock";
import { Problem } from "./Problem";
import { Quiz } from "./Quiz";
import { Steps } from "./Steps";
import { Text } from "./Text";

export function renderBlock(block: Block, ctx: BlockCtx): ReactNode {
  switch (block.type) {
    case "heading":
      return <Heading block={block} ctx={ctx} />;
    case "text":
      return <Text block={block} ctx={ctx} />;
    case "math":
      return <MathBlock block={block} ctx={ctx} />;
    case "image":
      return <ImageBlock block={block} ctx={ctx} />;
    case "callout":
      return <Callout block={block} ctx={ctx} />;
    case "example":
      return <Example block={block} ctx={ctx} />;
    case "quiz":
      return <Quiz block={block} ctx={ctx} />;
    case "problem":
      return <Problem block={block} ctx={ctx} />;
    case "steps":
      return <Steps block={block} ctx={ctx} />;
    default:
      // Temporary null: graph (Task 8), geometry (Task 9), custom (Task 10) fill this.
      return null;
  }
}
