import { useSyncExternalStore } from "react";

// From 800px the chat can sit beside the workspace.
const QUERY = "(min-width: 800px)";

const subscribe = (cb: () => void) => {
  const mq = matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(QUERY).matches,
    () => false,
  );
}
