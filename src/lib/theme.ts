// Light/dark override: data-theme on <html>, saved in localStorage. With no choice saved, the system setting rules.
export type Theme = "light" | "dark";

const KEY = "df-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Inlined in <head> so the saved theme is set before first paint.
export const THEME_INIT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia(DARK_QUERY).matches ? "dark" : "light";
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
  const query = matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    query.removeEventListener("change", onChange);
  };
}
