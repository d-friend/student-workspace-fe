// Light by default; dark only by choice: data-theme on <html>, saved in localStorage. The system setting is ignored.
export type Theme = "light" | "dark";

const KEY = "df-theme";

// Inlined in <head> so the saved theme is set before first paint.
export const THEME_INIT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

// The workspace iframes are sandboxed (opaque origin), so the theme reaches them by message.
export function postTheme(win: Window | null | undefined, theme: Theme = currentTheme()) {
  win?.postMessage({ dfriendTheme: theme }, "*");
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  for (const frame of document.querySelectorAll("iframe")) postTheme(frame.contentWindow, theme);
}

export function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
