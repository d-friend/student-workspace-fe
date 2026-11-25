import { useSyncExternalStore } from "react";

// resumeSession sets it just before the page loads home; home clears it once the session is restored. While it is set, home is
// opening a session the student picked, so it draws that session's shape, not the empty start screen.
const KEY = "df-opening";

export function markOpening(): void {
  try { sessionStorage.setItem(KEY, "1"); } catch { /* storage blocked: the empty state may flash, nothing breaks */ }
}

export function clearOpening(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* as above */ }
}

const read = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } };

export const useOpening = (): boolean => useSyncExternalStore(() => () => {}, read, () => false);
