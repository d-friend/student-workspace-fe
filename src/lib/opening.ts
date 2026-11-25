import { useSyncExternalStore } from "react";

// Home asks "is there a saved session to wait for?" before it draws anything, from two local hints, so a first-time visitor's start screen
// never waits on the network:
// - "df-opening": resumeSession sets it just before the page loads home (the student picked a session); home clears it once restored.
// - "df-session": this browser had a current session when home last settled (set when a session exists, cleared when there is none).
const KEY = "df-opening";
const SESSION_KEY = "df-session";

export function markOpening(): void {
  try { sessionStorage.setItem(KEY, "1"); } catch { /* storage blocked: the empty state may flash, nothing breaks */ }
}

export function clearOpening(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* as above */ }
}

const read = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } };

export const useOpening = (): boolean => useSyncExternalStore(() => () => {}, read, () => false);

// THEME_INIT sets data-expect on <html> before first paint when a session is expected; the CSS hides the start screen until home has heard from the server.
export function releaseStartScreen(): void {
  delete document.documentElement.dataset.expect;
}

export function setSessionHint(has: boolean): void {
  try { if (has) localStorage.setItem(SESSION_KEY, "1"); else localStorage.removeItem(SESSION_KEY); } catch { /* storage blocked: no hint, the start screen shows at once */ }
}

const readHint = () => { try { return localStorage.getItem(SESSION_KEY) === "1"; } catch { return false; } };

// True when home should hold its start screen for the saved session: false on the server and for anyone with no hint.
export const useExpectingSession = (): boolean => {
  const opening = useOpening();
  const hinted = useSyncExternalStore(() => () => {}, readHint, () => false);
  return opening || hinted;
};
