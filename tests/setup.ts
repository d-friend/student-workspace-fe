// jsdom has no matchMedia; the theme toggle reads the system colour scheme through it.
window.matchMedia ??= (query: string) =>
  ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;

// jsdom has no Element.scrollBy; the pet layer scrolls the doc clear of a docked bubble with it.
Element.prototype.scrollBy ??= function (this: Element, arg?: ScrollToOptions | number) {
  if (typeof arg === "object") this.scrollTop += arg.top ?? 0;
} as Element["scrollBy"];
