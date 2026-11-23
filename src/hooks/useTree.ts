import { useCallback, useEffect, useRef, useState } from "react";
import { createGuest, getTree, type TreeResponse } from "@/lib/api";

type State = { tree: TreeResponse | null; ready: boolean };

// A failed load hides the tree instead of failing the page: the cards below do not depend on it.
export function useTree(): State & { reload: () => void } {
  const [state, setState] = useState<State>({ tree: null, ready: false });
  const [version, setVersion] = useState(0);
  const request = useRef<{ version: number; result: Promise<State> } | null>(null);

  useEffect(() => {
    let active = true;
    // Retained across StrictMode's effect replay, like useProgress; a reload (version change) asks again.
    if (request.current?.version !== version) {
      request.current = {
        version,
        result: createGuest(navigator.language?.slice(0, 20) || undefined)
          .then(() => getTree())
          .then(tree => ({ tree, ready: true }))
          .catch(() => ({ tree: null, ready: true })),
      };
    }
    void request.current.result.then(result => { if (active) setState(result); });
    return () => { active = false; };
  }, [version]);

  const reload = useCallback(() => setVersion(v => v + 1), []);
  return { ...state, reload };
}
