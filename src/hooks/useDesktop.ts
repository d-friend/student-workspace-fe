import { useSyncExternalStore } from "react";

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

// From 800px the chat can sit beside the workspace.
export const useDesktop = () => useMedia("(min-width: 800px)");

// Below 640px a horizontal mind map cannot be read, so a project's map becomes an outline.
export const useNarrow = () => useMedia("(max-width: 639px)");
