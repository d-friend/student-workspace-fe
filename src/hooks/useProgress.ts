import { useEffect, useRef, useState } from "react";
import { createGuest, getProgress, type ProgressItem } from "@/lib/api";

export function useProgress() {
  const [state, setState] = useState<{ items: ProgressItem[]; ready: boolean }>({ items: [], ready: false });
  const request = useRef<Promise<{ items: ProgressItem[] }> | null>(null);

  useEffect(() => {
    let active = true;
    // Share useWorkspace's in-flight guest creation so the first GET already has its cookie.
    // Retain the request across StrictMode's effect replay; a failed optional fetch stays empty.
    request.current ??= createGuest(navigator.language?.slice(0, 20) || undefined)
      .then(() => getProgress())
      .catch(() => ({ items: [] }));
    void request.current.then(({ items }) => { if (active) setState({ items, ready: true }); });
    return () => { active = false; };
  }, []);

  return state;
}
