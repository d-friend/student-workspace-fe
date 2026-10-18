// jsdom has no matchMedia; the theme toggle reads the system colour scheme through it.
window.matchMedia ??= (query: string) =>
  ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
