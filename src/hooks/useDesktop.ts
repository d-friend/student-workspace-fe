import { useSyncExternalStore } from "react";

// The 800px breakpoint every pet/chat stylesheet switches on: docked chat column above it, bottom sheet below.
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
