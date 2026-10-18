// The unfold (spec §6): the problem flies from the entry composer to the workspace. Only a live send from the entry
// flies; a restore, a new problem or a phase switch never makes the screen go entry -> building with no workspace.
import { useEffect, useState } from "react";

import type { Screen } from "@/hooks/useWorkspace";

export type UnfoldPhase = "entry" | "flying" | "settled";

export const FLY_MS = 1050;

const atEntry = (s: Screen) => s === "empty" || s === "photo";

export function useUnfold(screen: Screen, workspaceExists: boolean): UnfoldPhase {
  const [prev, setPrev] = useState(screen);
  const [flying, setFlying] = useState(false);
  if (screen !== prev) {
    setPrev(screen);
    if (atEntry(prev) && screen === "building" && !workspaceExists) {
      setFlying(!matchMedia("(prefers-reduced-motion: reduce)").matches);
    } else if (atEntry(screen)) {
      setFlying(false); // the turn failed with nothing to show: straight back to the entry
    }
  }

  useEffect(() => {
    if (!flying) return;
    const t = setTimeout(() => setFlying(false), FLY_MS);
    return () => clearTimeout(t);
  }, [flying]);

  if (atEntry(screen)) return "entry";
  return flying ? "flying" : "settled";
}
