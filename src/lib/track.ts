import { sendEvents, type EventPayload } from "./api";

// Client event catalog, mirroring spec 6.3. Props are exactly these keys and no others: a key that
// is not here is a compile error, and the backend rejects it anyway (extra="forbid").
export type TrackEvents = {
  tab_switched: { from_phase: "learn" | "solve" | "practice"; to_phase: "learn" | "solve" | "practice" };
  history_opened: { sessions: number };
  app_opened: { path: string; referrer_host?: string; viewport_w: number; viewport_h: number; restored: boolean };
  empty_state_shown: NoProps;
  starter_clicked: { starter: "derivative" | "geometry" };
  type_problem_clicked: NoProps;
  chat_opened: { unread: boolean };
  photo_picked: {
    source: "snap_button" | "composer_button" | "retake" | "paste" | "drop";
    bytes: number;
    width: number;
    height: number;
    process_ms: number;
  };
  photo_unreadable: NoProps;
  photo_removed: NoProps;
  photo_retake_clicked: NoProps;
  message_sent: { has_photo: boolean; has_text: boolean; text_len: number; had_events: boolean; queued: boolean };
  restate_confirmed: NoProps;
  restate_corrected: NoProps;
  workspace_shown: { ms_since_send: number; replaced: boolean };
  simulation_shown: { ms_since_send: number; update: boolean };
  watching_cue_shown: NoProps;
  similar_offer_answered: { accepted: boolean };
  next_topic_offered: NoProps;
  next_topic_accepted: NoProps;
  similar_problem_accepted: NoProps;
  new_problem_clicked: { turns_in_session: number };
  turn_failed: { status?: number; code: string };
  session_restored: { messages: number; has_workspace: boolean };
  visibility_changed: { visible: boolean };
};

type NoProps = Record<string, never>;
export type EventType = keyof TrackEvents;

// Types without props can be tracked as `track("photo_removed")`.
export type TrackArgs<K extends EventType> = TrackEvents[K] extends NoProps
  ? [props?: NoProps, sessionId?: string | null]
  : [props: TrackEvents[K], sessionId?: string | null];

export type TrackFn = <K extends EventType>(type: K, ...args: TrackArgs<K>) => void;

export const FLUSH_AT = 20;
export const FLUSH_AFTER_MS = 5000;
export const MAX_BATCH = 50;
const MAX_QUEUED = 500; // shortcut: drops the oldest when the backend is down for long, fine for metrics

type Queued = { event: EventPayload; retried: boolean };

export type TrackerDeps = {
  send: (events: EventPayload[]) => Promise<unknown>;
  beacon: (json: string) => boolean;
  now?: () => Date;
};

export function createTracker({ send, beacon, now = () => new Date() }: TrackerDeps) {
  let queue: Queued[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let installed = false;

  const chunks = (items: Queued[]) => {
    const out: Queued[][] = [];
    for (let i = 0; i < items.length; i += MAX_BATCH) out.push(items.slice(i, i + MAX_BATCH));
    return out;
  };

  function schedule() {
    if (timer === undefined) timer = setTimeout(flush, FLUSH_AFTER_MS);
  }

  function failed(batch: Queued[]) {
    // One retry, then the events are dropped. Tracking must never surface an error.
    const again = batch.filter((q) => !q.retried).map((q) => ({ ...q, retried: true }));
    if (!again.length) return;
    queue = [...again, ...queue].slice(-MAX_QUEUED);
    schedule();
  }

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    for (const batch of chunks(queue.splice(0))) {
      try {
        send(batch.map((q) => q.event)).catch(() => failed(batch));
      } catch {
        failed(batch);
      }
    }
  }

  function flushBeacon() {
    clearTimeout(timer);
    timer = undefined;
    for (const batch of chunks(queue.splice(0))) {
      try {
        beacon(JSON.stringify({ events: batch.map((q) => q.event) }));
      } catch {
        // nothing left to do while the page is going away
      }
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === "hidden") flushBeacon();
  };

  function install() {
    if (installed || typeof window === "undefined") return;
    installed = true;
    window.addEventListener("pagehide", flushBeacon);
    document.addEventListener("visibilitychange", onVisibility);
  }

  function track<K extends EventType>(type: K, ...[props, sessionId]: TrackArgs<K>) {
    install();
    const event: EventPayload = {
      type,
      at: now().toISOString(),
      session_id: sessionId ?? null,
      props: props ?? {},
    };
    queue.push({ event, retried: false });
    if (queue.length > MAX_QUEUED) queue.shift();
    if (queue.length >= FLUSH_AT) flush();
    else schedule();
  }

  function dispose() {
    clearTimeout(timer);
    timer = undefined;
    if (installed) {
      window.removeEventListener("pagehide", flushBeacon);
      document.removeEventListener("visibilitychange", onVisibility);
      installed = false;
    }
  }

  return { track, flush, flushBeacon, dispose };
}

const tracker = createTracker({
  send: sendEvents,
  beacon: (json) => navigator.sendBeacon("/api/events", new Blob([json], { type: "application/json" })),
});

export const track = tracker.track;
