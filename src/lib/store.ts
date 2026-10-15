import type { Message } from "./api";

export const SESSION_KEY = "dfriend.session.v3";
const OLD_SESSION_KEY = "dfriend.session.v2";

// Browser storage can be blocked or full, so every access is guarded.
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

export type SavedSession = { sessionId: string | null; messages: Message[]; html: string | null };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

// A user message is text, or an image (with its base64 data) plus optional text. Assistant messages are text.
function validMessage(m: unknown, i: number): m is Message {
  if (!isObject(m) || m.role !== (i % 2 ? "assistant" : "user")) return false;
  if (typeof m.content === "string") return true;
  if (m.role !== "user" || !Array.isArray(m.content)) return false;
  const [image] = m.content as unknown[];
  return isObject(image) && isObject(image.source) && typeof image.source.data === "string";
}

function validSession(v: unknown): SavedSession | null {
  if (!isObject(v) || !Array.isArray(v.messages)) return null;
  const { messages } = v;
  if (!messages.length || messages.length % 2) return null;
  if (!messages.every(validMessage)) return null;
  if (v.html != null && typeof v.html !== "string") return null;
  if (v.sessionId != null && typeof v.sessionId !== "string") return null;
  return { sessionId: (v.sessionId as string | null) ?? null, messages, html: (v.html as string | null) ?? null };
}

export function saveSession(session: SavedSession): void {
  store.set(SESSION_KEY, JSON.stringify(session));
}

// Returns null for anything missing, corrupted or out of order: the student starts fresh instead.
export function loadSession(): SavedSession | null {
  store.remove(OLD_SESSION_KEY);
  const raw = store.get(SESSION_KEY);
  if (raw === null) return null;
  try {
    return validSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearSession(): void {
  store.remove(SESSION_KEY);
}
