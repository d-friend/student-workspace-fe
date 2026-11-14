import { useCallback, useEffect, useRef, useState } from "react";
import { createGuest, getProgress, type ProgressItem } from "@/lib/api";

type State = { items: ProgressItem[]; ready: boolean; failed: boolean };

export function useProgress() {
  const [state, setState] = useState<State>({ items: [], ready: false, failed: false });
  const [attempt, setAttempt] = useState(0);
  const request = useRef<Promise<State> | null>(null);
  const retry = useCallback(() => {
    request.current = null;
    setState({ items: [], ready: false, failed: false });
    setAttempt(n => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    // Share useWorkspace's in-flight guest creation so the first GET already has its cookie.
    // Retain the request across StrictMode's effect replay, until an explicit retry.
    request.current ??= createGuest(navigator.language?.slice(0, 20) || undefined)
      .then(() => getProgress())
      .then(({ items }) => ({ items, ready: true, failed: false }))
      .catch(() => ({ items: [], ready: true, failed: true }));
    void request.current.then(result => { if (active) setState(result); });
    return () => { active = false; };
  }, [attempt]);

  return { ...state, retry };
}
