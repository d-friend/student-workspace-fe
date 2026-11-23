import { useCallback, useEffect, useState } from "react";
import { listPacks, type PackSummary } from "@/lib/api";

// The student's packs, newest first. A failed load shows no list: the tree and the cards do not depend on it.
export function usePacks(): { packs: PackSummary[]; reload: () => void } {
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    void listPacks().then(list => { if (active) setPacks(list); }, () => {});
    return () => { active = false; };
  }, [version]);
  const reload = useCallback(() => setVersion(v => v + 1), []);
  return { packs, reload };
}
