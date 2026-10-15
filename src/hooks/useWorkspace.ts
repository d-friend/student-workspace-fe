// The turn state machine: a port of the logic in public/index.html (turn, flush, claim, submit, restore,
// newProblem and the message listener). `createWorkspace` is plain TypeScript with no React, so there are
// no stale closures in the async callbacks; `useWorkspace` wraps it with useSyncExternalStore.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import * as realApi from "@/lib/api";
import { ApiError, TurnError, type Message, type StartedVia } from "@/lib/api";
import { copy } from "@/lib/copy";
import {
  eventMessage,
  shouldTrigger,
  studentView,
  userMessage,
  watching,
  withPhoto,
  type WorkspaceEvent,
} from "@/lib/frame";
import { parse, type Parsed } from "@/lib/parse";
import { readPhoto as realReadPhoto, type PhotoResult } from "@/lib/photo";
import { track as realTrack, type TrackFn } from "@/lib/track";

// shortcut: starter prompts live here, not in copy.ts (another task's file); move them there later.
const STARTER_PROMPTS = {
  derivative:
    "Cho f(x) = x². Dùng định nghĩa đạo hàm để tính f′(2). Mình không hiểu trực giác của đạo hàm. Giúp mình tự hiểu, đừng đưa đáp án luôn.",
  geometry:
    "Cho tam giác ABC cân tại A, M là trung điểm BC. Chứng minh AM vuông góc với BC. Mình muốn tự làm, chỉ nhắc khi mình sai hoặc nhờ gợi ý.",
} as const;

const FLUSH_DELAY_MS = 800;
const MAX_PENDING = 20;

export type Bubble =
  | { id: number; kind: "student"; text: string; photo: string | null }
  | {
      id: number;
      kind: "agent";
      text: string;
      waiting: boolean;
      line: number | null;
      offer: boolean;
      restate: boolean;
    }
  | { id: number; kind: "error" | "note"; text: string };

type NewBubble = Bubble extends infer B ? (B extends Bubble ? Omit<B, "id"> : never) : never;

export type Screen = "workspace" | "building" | "photo" | "empty";

export type WorkspaceState = {
  ready: boolean;
  bubbles: Bubble[];
  busy: boolean;
  typedTurn: boolean;
  queued: boolean;
  input: string;
  photo: string | null;
  html: string | null;
  building: boolean;
  screen: Screen;
  watching: boolean;
  restateChips: boolean;
  offerChips: boolean;
  hasMessages: boolean;
  inputDisabled: boolean;
  sendDisabled: boolean;
};

export type WorkspaceDeps = {
  api: Pick<typeof realApi, "createGuest" | "currentSession" | "createSession" | "endSession" | "turn">;
  track: TrackFn;
  readPhoto: (file: Blob) => Promise<PhotoResult>;
  now?: () => number;
};

type Queued = { text: string; photo: string | null; bubbleId: number };

function describeError(e: unknown): { text: string; code: string; status?: number; sessionGone: boolean } {
  if (e instanceof ApiError) {
    const sessionGone = e.code === "session_ended" || e.code === "session_not_found" || e.status === 409;
    let text: string;
    if (sessionGone) text = copy.errEnded;
    else if (e.status === 413) text = copy.errTooLong;
    else if (e.status === 429) text = copy.errRateLimited(Math.max(1, Math.ceil((e.retryAfterS ?? 60) / 60)));
    else if (e.status === 503) text = copy.errBudget;
    else text = copy.errConnect(e.message);
    return { text, code: e.code, status: e.status, sessionGone };
  }
  if (e instanceof TurnError) return { text: copy.errConnect(e.message), code: e.code, sessionGone: false };
  const message = e instanceof Error ? e.message : "request failed";
  return { text: copy.errConnect(message), code: "network", sessionGone: false };
}

export function createWorkspace(deps: WorkspaceDeps) {
  const { api, track, readPhoto } = deps;
  const now = deps.now ?? Date.now;
  // Set by the hook once the iframe and the composer exist.
  const dom = { frameWindow: (): Window | null => null, focusInput: (): void => {} };

  let ready = false;
  let started = false;
  let nextId = 1;
  let messages: Message[] = [];
  let bubbles: Bubble[] = [];
  let busy = false;
  let typedTurn = false;
  let queued: Queued | null = null; // one typed message waiting for a workspace turn to end
  let pending: WorkspaceEvent[] = [];
  let handledGesture = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let input = "";
  let photo: string | null = null;
  let photoNoteId: number | null = null;
  let html: string | null = null;
  let building = false;
  let sessionId: string | null = null;
  // True once the server has confirmed the session (created, restored or used by a turn); events go out
  // without a session id until then.
  let sessionConfirmed = false;
  let restateClosedId: number | null = null;
  let offerClosedId: number | null = null;

  const sid = () => (sessionConfirmed ? sessionId : null);

  // Immutable snapshot for useSyncExternalStore, rebuilt on every change.
  const listeners = new Set<() => void>();
  let snapshot = compute();

  function compute(): WorkspaceState {
    const lastAgent = [...bubbles].reverse().find((b) => b.kind === "agent");
    const agent = lastAgent?.kind === "agent" ? lastAgent : null;
    const screen: Screen =
      html !== null ? "workspace" : busy ? "building" : photo !== null ? "photo" : "empty";
    const inputDisabled = busy && typedTurn;
    return {
      ready,
      bubbles,
      busy,
      typedTurn,
      queued: queued !== null,
      input,
      photo,
      html,
      building,
      screen,
      watching: html !== null && !busy && watching(messages),
      restateChips: !busy && !!agent?.restate && restateClosedId !== agent.id,
      offerChips: !busy && !!agent?.offer && offerClosedId !== agent.id,
      hasMessages: messages.length > 0,
      inputDisabled,
      sendDisabled: inputDisabled || queued !== null,
    };
  }

  function publish() {
    const prev = snapshot;
    snapshot = compute();
    if (snapshot.ready && snapshot.screen === "empty" && !(prev.ready && prev.screen === "empty")) {
      track("empty_state_shown", {}, sid());
    }
    if (snapshot.watching && !prev.watching) track("watching_cue_shown", {}, sid());
    listeners.forEach((l) => l());
  }

  function addBubble(b: NewBubble): number {
    const id = nextId++;
    bubbles = [...bubbles, { ...b, id } as Bubble];
    return id;
  }

  function updateBubble(id: number, b: NewBubble) {
    bubbles = bubbles.map((x) => (x.id === id ? ({ ...b, id } as Bubble) : x));
  }

  function removeBubble(id: number | null) {
    if (id !== null) bubbles = bubbles.filter((b) => b.id !== id);
  }

  const agentBubble = (text: string, view: Parsed, waiting = false): NewBubble => ({
    kind: "agent",
    text,
    waiting,
    line: view.line,
    offer: view.offer,
    restate: view.restate,
  });

  const lastAgentId = () => [...bubbles].reverse().find((b) => b.kind === "agent")?.id ?? null;
  const closeRestate = () => {
    restateClosedId = lastAgentId();
  };

  function claim(events: WorkspaceEvent[]) {
    for (const e of events) {
      const g = e.gesture ?? -Infinity;
      if (g > handledGesture) handledGesture = g;
    }
  }

  function clearTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  function install(doc: string, sentAt: number) {
    const replaced = html !== null;
    html = doc;
    track("workspace_shown", { ms_since_send: Math.max(0, now() - sentAt), replaced }, sid());
  }

  async function runTurn(
    typed: boolean,
    text: string,
    existingStudentId: number | null,
    shot: string | null,
    via?: StartedVia,
  ): Promise<void> {
    busy = true;
    typedTurn = typed;
    const sentAt = now();
    let consumed: WorkspaceEvent[] = [];
    let studentId = existingStudentId;
    let content: Message["content"];
    if (typed) {
      consumed = pending;
      claim(consumed);
      content = withPhoto(userMessage(consumed, text), shot);
      pending = [];
      studentId ??= addBubble({ kind: "student", text, photo: shot });
    } else {
      content = text;
    }
    const base = messages.length;
    messages = [...messages, { role: "user", content } as Message];

    // Workspace turns get no bubble until the agent actually says something.
    let agentId: number | null = typed
      ? addBubble({
          kind: "agent",
          text: copy.thinking,
          waiting: true,
          line: null,
          offer: false,
          restate: false,
        })
      : null;
    publish();

    const show = (view: Parsed, final: boolean) => {
      const chat =
        view.chat ||
        (typed ? (view.building ? copy.building : final && view.html !== null ? copy.built : "") : "");
      if (agentId === null) {
        if (chat) agentId = addBubble(agentBubble(chat, view));
      } else {
        updateBubble(agentId, agentBubble(chat || copy.thinking, view, !chat));
      }
    };

    let keepEvents = false;
    try {
      if (sessionId === null) {
        sessionId = (await api.createSession(via ?? (shot ? "photo" : "typed"))).sessionId;
        sessionConfirmed = true;
      }
      let raw = "";
      await api.turn(sessionId, messages.at(-1)!, (delta) => {
        raw += delta;
        const view = parse(raw);
        show(view, false);
        building = view.building;
        publish();
      });
      sessionConfirmed = true;
      if (!raw.trim()) throw new TurnError("empty_reply", "the agent sent an empty reply");

      const view = parse(raw);
      if (view.silent) {
        messages = [...messages, { role: "assistant", content: "[silent]" }];
        removeBubble(agentId);
        agentId = null;
      } else {
        messages = [...messages, { role: "assistant", content: raw }];
        show(view, true);
      }
      if (view.html !== null) {
        pending = [];
        install(view.html, sentAt);
      }
    } catch (e) {
      messages = messages.slice(0, base);
      removeBubble(agentId);
      const info = describeError(e);
      if (typed) {
        removeBubble(studentId);
        addBubble({ kind: "error", text: info.text });
        if (text) input = input ? text + "\n" + input : text;
        if (shot && photo === null) photo = shot;
        // Put the events back so they ride along with the resend; a stale flush timer must not fire them alone.
        if (!pending.length) clearTimer();
        pending = [...consumed, ...pending].slice(-MAX_PENDING);
        keepEvents = true;
      } else {
        addBubble({ kind: "note", text: info.text });
      }
      track(
        "turn_failed",
        info.status === undefined ? { code: info.code } : { status: info.status, code: info.code },
        sid(),
      );
      if (info.sessionGone) {
        sessionId = null;
        sessionConfirmed = false;
        try {
          sessionId = (await api.createSession("typed")).sessionId;
          sessionConfirmed = true;
        } catch {
          // The next turn creates one.
        }
      } else if (e instanceof TurnError && e.code === "history_conflict") {
        // Another tab changed the history: take the server's version, and keep the error visible.
        try {
          const saved = await api.currentSession();
          if (saved) {
            restore(saved);
            addBubble(typed ? { kind: "error", text: info.text } : { kind: "note", text: info.text });
          }
        } catch {
          // Keep the local view; the next turn will report the conflict again.
        }
      }
    } finally {
      busy = false;
      building = false;
      publish();
      if (typed) dom.focusInput();
      if (!keepEvents) flush();
    }
  }

  function flush() {
    if (busy) return;
    if (queued) {
      const q = queued;
      queued = null;
      void runTurn(true, q.text, q.bubbleId, q.photo);
    } else if (shouldTrigger(pending, handledGesture)) {
      const events = pending;
      pending = [];
      claim(events);
      void runTurn(false, eventMessage(events), null, null);
    }
  }

  // One typed message: runs now, or waits behind a workspace turn. Ignored while another is waiting.
  function dispatch(text: string, shot: string | null, via?: StartedVia): Promise<void> {
    if (queued || (busy && typedTurn)) return Promise.resolve();
    if (busy) {
      queued = { text, photo: shot, bubbleId: addBubble({ kind: "student", text, photo: shot }) };
      publish();
      return Promise.resolve();
    }
    return runTurn(true, text, null, shot, via);
  }

  const onMessage = (e: MessageEvent) => {
    const win = dom.frameWindow();
    if (!win || e.source !== win || e.data?.dfriend !== true || typeof e.data.event !== "object") return;
    pending = [...pending, e.data.event as WorkspaceEvent].slice(-MAX_PENDING);
    closeRestate();
    publish();
    if (timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        flush();
      }, FLUSH_DELAY_MS);
    }
  };

  const onVisibility = () => {
    track("visibility_changed", { visible: document.visibilityState === "visible" }, sid());
  };

  // Registered before the first track() call, so the tracker's own hidden-flush runs after this one.
  function attach(): () => void {
    window.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimer();
    };
  }

  function restore(saved: { sessionId: string; messages: Message[]; html: string | null }) {
    messages = saved.messages;
    sessionId = saved.sessionId;
    sessionConfirmed = true;
    html = saved.html;
    bubbles = [];
    restateClosedId = null;
    offerClosedId = null;
    saved.messages.forEach((m, i) => {
      if (i % 2) {
        const view = parse(m.content as string);
        if (view.chat) addBubble(agentBubble(view.chat, view));
      } else {
        const view = studentView(m.content);
        if (view) addBubble({ kind: "student", text: view.text, photo: view.photo || null });
      }
    });
    // A trailing [silent] means something happened after the last visible agent message.
    if (parse(saved.messages.at(-1)!.content as string).chat === "") {
      closeRestate();
      offerClosedId = lastAgentId();
    }
  }

  function init() {
    if (started) return;
    started = true;
    void (async () => {
      try {
        await api.createGuest(navigator.language?.slice(0, 20) || undefined);
      } catch {
        // The first API call retries it (401 no_guest).
      }
      let saved: Awaited<ReturnType<typeof api.currentSession>> = null;
      try {
        saved = await api.currentSession();
      } catch {
        // Start empty.
      }
      // The composer is live while the two requests above run: never replace a turn that already started.
      let applied: typeof saved = null;
      if (saved && !busy && messages.length === 0) {
        restore(saved);
        applied = saved;
      }
      ready = true;
      publish();
      let referrerHost: string | undefined;
      try {
        referrerHost = document.referrer ? new URL(document.referrer).hostname.slice(0, 100) : undefined;
      } catch {
        referrerHost = undefined;
      }
      track("app_opened", {
        path: location.pathname.slice(0, 100),
        ...(referrerHost ? { referrer_host: referrerHost } : {}),
        viewport_w: window.innerWidth,
        viewport_h: window.innerHeight,
        restored: applied !== null,
      });
      if (applied) {
        track("session_restored", { messages: applied.messages.length, has_workspace: applied.html !== null });
      }
    })();
  }

  const actions = {
    setInput(value: string) {
      input = value;
      publish();
    },

    submit(): Promise<void> {
      const text = input.trim();
      if ((!text && photo === null) || queued || (busy && typedTurn)) return Promise.resolve();
      const shot = photo;
      input = "";
      photo = null;
      track(
        "message_sent",
        {
          has_photo: shot !== null,
          has_text: text.length > 0,
          text_len: text.length,
          had_events: pending.length > 0,
          queued: busy,
        },
        sid(),
      );
      closeRestate();
      return dispatch(text, shot);
    },

    async pickPhoto(file: Blob, source: "snap_button" | "composer_button" | "retake") {
      removeBubble(photoNoteId);
      photoNoteId = null;
      try {
        const r = await readPhoto(file);
        photo = r.data;
        track(
          "photo_picked",
          { source, bytes: r.bytes, width: r.width, height: r.height, process_ms: r.processMs },
          sid(),
        );
      } catch {
        photoNoteId = addBubble({ kind: "note", text: copy.photoUnreadable });
        track("photo_unreadable", {}, sid());
      }
      publish();
    },

    removePhoto() {
      photo = null;
      track("photo_removed", {}, sid());
      publish();
      dom.focusInput();
    },

    // The component opens the file picker itself and then calls pickPhoto(file, "retake").
    retake() {
      track("photo_retake_clicked", {}, sid());
    },

    typeProblemClicked() {
      track("type_problem_clicked", {}, sid());
      dom.focusInput();
    },

    startStarter(starter: "derivative" | "geometry"): Promise<void> {
      if (busy) return Promise.resolve();
      track("starter_clicked", { starter }, sid());
      return runTurn(true, STARTER_PROMPTS[starter], null, null, `starter_${starter}`);
    },

    confirmRestate() {
      track("restate_confirmed", {}, sid());
      closeRestate();
      publish();
    },

    correctRestate() {
      track("restate_corrected", {}, sid());
      closeRestate();
      input = copy.restatePrefill;
      publish();
      dom.focusInput();
    },

    answerOffer(accepted: boolean): Promise<void> {
      track("similar_offer_answered", { accepted }, sid());
      offerClosedId = lastAgentId();
      publish();
      return accepted ? dispatch(copy.offerYesMessage, null) : Promise.resolve();
    },

    newProblem() {
      if (busy) return;
      track("new_problem_clicked", { turns_in_session: Math.floor(messages.length / 2) }, sid());
      if (sessionId) api.endSession(sessionId, "new_problem").catch(() => {});
      clearTimer();
      messages = [];
      pending = [];
      queued = null;
      bubbles = [];
      html = null;
      building = false;
      sessionId = null;
      sessionConfirmed = false;
      restateClosedId = null;
      offerClosedId = null;
      publish();
    },
  };

  return {
    // Gives the controller the iframe's window (to filter messages) and a way to focus the composer.
    bind(d: { frameWindow: () => Window | null; focusInput: () => void }) {
      dom.frameWindow = d.frameWindow;
      dom.focusInput = d.focusInput;
    },
    actions,
    attach,
    init,
    getState: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export function useWorkspace(deps: Partial<WorkspaceDeps> = {}) {
  // Created once; later changes to `deps` are ignored (they exist for tests).
  const [ws] = useState(() => createWorkspace({ api: realApi, track: realTrack, readPhoto: realReadPhoto, ...deps }));
  const state = useSyncExternalStore(ws.subscribe, ws.getState, ws.getState);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ws.bind({
      frameWindow: () => frameRef.current?.contentWindow ?? null,
      focusInput: () => inputRef.current?.focus(),
    });
    const detach = ws.attach();
    ws.init();
    return detach;
  }, [ws]);

  return { ...state, ...ws.actions, frameRef, inputRef };
}
