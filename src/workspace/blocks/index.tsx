import type { ReactNode } from "react";
import type { Block, BlockCtx } from "../types";
import { Custom } from "./Custom";
import { Callout } from "./Callout";
import { Example } from "./Example";
import { Geometry } from "./Geometry";
import { Graph } from "./Graph";
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
    case "graph":
      return <Graph block={block} ctx={ctx} />;
    case "geometry":
      return <Geometry block={block} ctx={ctx} />;
    case "custom":
      return <Custom block={block} ctx={ctx} />;
  }
}
