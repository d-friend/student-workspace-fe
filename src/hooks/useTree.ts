import { useEffect, useRef, useState } from "react";
import { createGuest, getTree, type TreeResponse } from "@/lib/api";

type State = { tree: TreeResponse | null; ready: boolean };

// A failed load hides the tree instead of failing the page: the cards below do not depend on it.
export function useTree(): State {
  const [state, setState] = useState<State>({ tree: null, ready: false });
  const request = useRef<Promise<State> | null>(null);

  useEffect(() => {
    let active = true;
    // Retained across StrictMode's effect replay, like useProgress.
    request.current ??= createGuest(navigator.language?.slice(0, 20) || undefined)
      .then(() => getTree())
      .then(tree => ({ tree, ready: true }))
      .catch(() => ({ tree: null, ready: true }));
    void request.current.then(result => { if (active) setState(result); });
    return () => { active = false; };
  }, []);

  return state;
}
