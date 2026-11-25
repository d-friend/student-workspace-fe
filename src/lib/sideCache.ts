// The sidebar's last lists, kept per tab so a hard reload (opening a session reloads home) paints them at once instead of a skeleton.
// They are replaced by the fresh response, and dropped when the identity changes (login, logout), so they never show another account's history.
const KEYS = { history: "df-cache-history", projects: "df-cache-projects" } as const;

export function readCache<T>(name: keyof typeof KEYS): T | null {
  try {
    const raw = sessionStorage.getItem(KEYS[name]);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export function writeCache(name: keyof typeof KEYS, value: unknown): void {
  try { sessionStorage.setItem(KEYS[name], JSON.stringify(value)); } catch { /* storage blocked or full: the skeleton shows instead */ }
}

export function clearCaches(): void {
  try { Object.values(KEYS).forEach(key => sessionStorage.removeItem(key)); } catch { /* as above */ }
}
