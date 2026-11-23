"use client";

import { Shell } from "@/components/Shell";
import { useDesktop } from "@/hooks/useDesktop";
import { ProgressView } from "../../../progress/ProgressView";
import { progressFixture, treeFixture } from "./treeFixture";

export function TreeFixtureView() {
  const desktop = useDesktop();
  return <Shell work={<ProgressView items={progressFixture} tree={treeFixture} ready failed={false} onRetry={() => {}} newFailed={false} packs={[]} onUploaded={() => {}} onLearnMore={() => {}} learnFailed={false} />}
    layer={null} floatingPanels showCornerActions={!desktop} />;
}
