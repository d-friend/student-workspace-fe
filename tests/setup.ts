// jsdom has no matchMedia; the theme toggle reads the system colour scheme through it.
window.matchMedia ??= (query: string) =>
  ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;

// jsdom has no Element.scrollBy; the pet layer scrolls the doc clear of a docked bubble with it.
Element.prototype.scrollBy ??= function (this: Element, arg?: ScrollToOptions | number) {
  if (typeof arg === "object") this.scrollTop += arg.top ?? 0;
} as Element["scrollBy"];

// Skeletons are timing UI (shown after 150 ms, held 300 ms): on a loaded machine a slow render would make tests race them. Unit tests never show
// one; tests/unit/skeleton.test.tsx and the loading-states e2e cover the real timing.
import { loadingTiming } from "@/components/Skeleton";
loadingTiming.showAfter = null;
