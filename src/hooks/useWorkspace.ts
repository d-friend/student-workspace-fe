// The turn state machine: a port of the logic in public/index.html (turn, flush, claim, submit, restore,
// newProblem and the message listener). `createWorkspace` is plain TypeScript with no React, so there are
// no stale closures in the async callbacks; `useWorkspace` wraps it with useSyncExternalStore.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import * as realApi from "@/lib/api";
import { ApiError, TurnError, type Message, type StartedVia, type TurnEvent } from "@/lib/api";
import { copy } from "@/lib/copy";
import {
  customFrames,
  eventMessage,
  shouldTrigger,
  studentView,
  userMessage,
  watching,
  withPhoto,
  type WorkspaceEvent,
} from "@/lib/frame";
import { parse, RESTATE, type Parsed } from "@/lib/parse";
import { readPhoto as realReadPhoto, type PhotoResult } from "@/lib/photo";
import { track as realTrack, type TrackFn } from "@/lib/track";
import type { BlockCtx, CheckResponse, Phase, Workspace } from "@/workspace/types";

// shortcut: starter prompts live here, not in copy.ts (another task's file); move them there later.
const STARTER_PROMPTS = {
  derivative:
    "Cho f(x) = x². Dùng định nghĩa đạo hàm để tính f′(2). Mình không hiểu trực giác của đạo hàm. Giúp mình tự hiểu, đừng đưa đáp án luôn.",
  geometry:
    "Cho tam giác ABC cân tại A, M là trung điểm BC. Chứng minh AM vuông góc với BC. Mình muốn tự làm, chỉ nhắc khi mình sai hoặc nhờ gợi ý.",
} as const;

const STATUS_LABEL = {
  planning: copy.statusPlanning,
  searching: copy.statusSearching,
  reading: copy.statusReading,
} as const;

const FLUSH_DELAY_MS = 800;
const RECOVER_MS = 120_000; // how long to wait for a build that outlived its connection (the planner caps at 90 s)
const RECOVER_POLL_MS = 2000;
const RECOVER_MAX_FAILS = 5; // consecutive failed status checks (about 10 s offline) before the turn counts as lost
const MAX_PENDING = 20;

// `turn` numbers the exchanges (a typed message, or a batch of workspace events, and what comes back), so the pet
// bubble can show only the latest one.
export type Bubble =
  | { id: number; turn: number; kind: "student"; text: string; photo: string | null }
  | {
      id: number;
      turn: number;
      kind: "agent";
      text: string;
      waiting: boolean;
      line: number | null;
      offer: boolean;
      restate: boolean;
      opts: string[] | null;
      ask: "how" | "why" | null;
    }
  | { id: number; turn: number; kind: "error" | "note"; text: string };

type NewBubble = Bubble extends infer B ? (B extends Bubble ? Omit<B, "id" | "turn"> : never) : never;

// The same words, ignoring case, spacing and end punctuation.
const norm = (s: string) => s.toLowerCase().replace(/[\s.!?…]+/g, " ").trim();

export type Screen = "workspace" | "building" | "photo" | "empty";

export type WorkspaceState = {
  ready: boolean;
  bubbles: Bubble[];
  busy: boolean;
  typedTurn: boolean;
  queued: boolean;
  input: string;
  photo: string | null;
  html: string | null; // legacy iframe workspace, only when there are no structured workspaces
  workspaces: Partial<Record<Phase, Workspace>>;
  phase: Phase | null;
  // SSE line_state and task_done, by workspace id (block ids are unique per doc only).
  overrides: Record<string, BlockCtx["overrides"]>;
  taskDone: Record<string, string[]>;
  building: boolean;
  status: string | null; // the pet bubble's status label from the latest SSE status
  buildingPhase: Phase | null;
  buildFailed: boolean; // the planner failed and there is nothing to show
  screen: Screen;
  watching: boolean;
  restateChips: boolean;
  offerChips: boolean;
  optChips: string[] | null;
  hasMessages: boolean;
  newProblemCount: number; // bumps on each "Bài mới" that reset the session, so the pet can jump back to the entry
  inputDisabled: boolean;
  sendDisabled: boolean;
  verdict: { seq: number; state: "ok" | "review" | null; done: boolean }; // latest line verdict; seq never resets
  checking: number; // checks in flight
};

export type WorkspaceDeps = {
  api: Pick<typeof realApi, "createGuest" | "currentSession" | "createSession" | "endSession" | "turn" | "turnStatus" | "check">;
  track: TrackFn;
  readPhoto: (file: Blob) => Promise<PhotoResult>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

type Queued = { text: string; photo: string | null; bubbleId: number };
type Saved = NonNullable<Awaited<ReturnType<typeof realApi.currentSession>>>;

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
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  // Set by the hook once the iframe and the composer exist.
  // reveal: the student must see the composer (a failed send, a correction), so a closed drawer opens for it.
  const dom = { frameWindow: (): Window | null => null, focusInput: ((): void => {}) as (reveal?: boolean) => void };

  let ready = false;
  let started = false;
  let nextId = 1;
  let turnNo = 0;
  let newProblems = 0;
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
  let workspaces: Partial<Record<Phase, Workspace>> = {};
  let phase: Phase | null = null;
  let overrides: WorkspaceState["overrides"] = {};
  let taskDone: WorkspaceState["taskDone"] = {};
  let building = false;
  let status: string | null = null;
  let buildingPhase: Phase | null = null;
  let buildFailed = false;
  let sessionId: string | null = null;
  // True once the server has confirmed the session (created, restored or used by a turn); events go out
  // without a session id until then.
  let sessionConfirmed = false;
  let restateClosedId: number | null = null;
  let offerClosedId: number | null = null;
  let optsClosedId: number | null = null;
  let checking = 0;
  let verdictSeq = 0;
  let verdict: WorkspaceState["verdict"] = { seq: 0, state: null, done: false };

  const sid = () => (sessionConfirmed ? sessionId : null);

  // Immutable snapshot for useSyncExternalStore, rebuilt on every change.
  const listeners = new Set<() => void>();
  let snapshot = compute();

  function compute(): WorkspaceState {
    const lastAgent = [...bubbles].reverse().find((b) => b.kind === "agent");
    const agent = lastAgent?.kind === "agent" ? lastAgent : null;
    const shown = phase !== null || html !== null;
    const screen: Screen = shown
      ? "workspace"
      : busy && !buildFailed
        ? "building"
        : photo !== null
          ? "photo"
          : "empty";
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
      workspaces,
      phase,
      overrides,
      taskDone,
      building,
      status,
      buildingPhase,
      buildFailed: buildFailed && !shown && !busy, // a retry while a turn streams would be a no-op
      screen,
      watching: shown && !busy && watching(messages),
      restateChips: !busy && !!agent?.restate && restateClosedId !== agent.id,
      offerChips: !busy && !!agent?.offer && offerClosedId !== agent.id,
      optChips: !busy && agent?.opts && optsClosedId !== agent.id ? agent.opts : null,
      hasMessages: messages.length > 0,
      newProblemCount: newProblems,
      inputDisabled,
      sendDisabled: inputDisabled || queued !== null,
      verdict,
      checking,
    };
  }

  // A different active phase clears the old phase's verdict; seq keeps counting.
  function activate(p: Phase) {
    if (p !== phase) verdict = { seq: verdictSeq, state: null, done: false };
    phase = p;
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
    bubbles = [...bubbles, { ...b, id, turn: turnNo } as Bubble];
    return id;
  }

  function updateBubble(id: number, b: NewBubble) {
    bubbles = bubbles.map((x) => (x.id === id ? ({ ...b, id, turn: x.turn } as Bubble) : x));
  }

  function insertBubbleBefore(beforeId: number, b: NewBubble): number {
    const id = nextId++;
    const i = bubbles.findIndex((x) => x.id === beforeId);
    bubbles = [...bubbles.slice(0, i), { ...b, id, turn: turnNo } as Bubble, ...bubbles.slice(i)];
    return id;
  }

  function removeBubble(id: number | null) {
    if (id !== null) bubbles = bubbles.filter((b) => b.id !== id);
  }

  const agentBubble = (text: string, view: Parsed, waiting = false): Extract<NewBubble, { kind: "agent" }> => ({
    kind: "agent",
    text,
    waiting,
    line: view.line,
    offer: view.offer,
    restate: view.restate,
    opts: view.opts,
    ask: view.ask,
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

  // A dropped stream (a locked phone) does not stop the build: the server finishes and saves the turn. Wait for it
  // and return the saved session, or null when nothing was saved (the request never arrived, or the turn failed).
  async function recover(sid: string, before: number): Promise<Saved | null> {
    const deadline = now() + RECOVER_MS;
    let fails = 0;
    while (now() < deadline) {
      try {
        const running = await api.turnStatus(sid);
        fails = 0;
        if (!running) {
          const saved = await api.currentSession();
          return saved && saved.sessionId === sid && saved.messages.length > before ? saved : null;
        }
      } catch {
        // Offline or still waking up: ask again, but not forever when the server is really unreachable.
        if (++fails >= RECOVER_MAX_FAILS) return null;
      }
      await sleep(RECOVER_POLL_MS);
    }
    return null;
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
    buildFailed = false;
    turnNo++;
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
          opts: null,
          ask: null,
        })
      : null;
    publish();

    let announceId: number | null = null;
    let announceText: string | null = null;
    let announceRestate = false; // a photo's restatement travels in the announce, so its reply inherits the chips
    let sawEvent = false;
    let gotWorkspace = false;

    // The model sometimes says its announce again as the reply; the student reads it once. While streaming, a reply
    // that is still a prefix of the announce is held back too.
    const repeats = (view: Parsed) =>
      announceText !== null && view.chat !== "" && norm(announceText).startsWith(norm(view.chat));
    const bubbleFor = (chat: string, view: Parsed, waiting = false) => ({
      ...agentBubble(chat, view, waiting),
      restate: view.restate || announceRestate,
    });

    const show = (view: Parsed, final: boolean) => {
      // A build is shown by the pet bubble's status row, not by a placeholder text, so the bubble keeps waiting.
      const chat = repeats(view)
        ? ""
        : view.chat || (typed && !view.building && final && (view.html !== null || gotWorkspace) ? copy.built : "");
      if (agentId === null) {
        if (chat) agentId = addBubble(bubbleFor(chat, view));
      } else {
        updateBubble(agentId, bubbleFor(chat || copy.thinking, view, !chat));
      }
    };

    const onEvent = (e: TurnEvent) => {
      sawEvent = true;
      if (e.event === "announce") {
        announceText = e.text;
        announceRestate = e.text.startsWith(RESTATE);
        const b: NewBubble = { kind: "agent", text: e.text, waiting: false, line: null, offer: false, restate: announceRestate, opts: null, ask: null };
        // Its own bubble, before the waiting one, which keeps "thinking" until the reply text arrives.
        announceId = agentId === null ? addBubble(b) : insertBubbleBefore(agentId, b);
      } else if (e.event === "status") {
        buildFailed = e.stage === "failed";
        status = e.stage === "failed" ? null : STATUS_LABEL[e.stage];
        building = e.stage !== "failed";
        buildingPhase = e.stage === "failed" ? null : (e.phase ?? buildingPhase);
      } else if (e.event === "workspace") {
        const old = workspaces[e.phase];
        const replaced = old !== undefined;
        workspaces = { ...workspaces, [e.phase]: { id: e.workspaceId, doc: e.doc } };
        activate(e.phase);
        gotWorkspace = true;
        building = false;
        status = null;
        buildingPhase = null;
        // Drop the replaced doc's line states and master completions.
        if (old) {
          overrides = { ...overrides };
          delete overrides[old.id];
          taskDone = { ...taskDone };
          delete taskDone[old.id];
          // Pending events about blocks that only the old doc had are stale. A shared id is ambiguous, so it stays.
          const gone = new Set(old.doc.blocks.map((b) => b.id));
          for (const w of Object.values(workspaces)) if (w.id !== e.workspaceId) w.doc.blocks.forEach((b) => gone.delete(b.id));
          pending = pending.filter((p) => !gone.has((p.data as { block_id?: string } | null)?.block_id ?? ""));
        }
        track("workspace_shown", { ms_since_send: Math.max(0, now() - sentAt), replaced }, sid());
      } else if (e.event === "phase") {
        if (workspaces[e.phase]) activate(e.phase);
      } else if (e.event === "line_state") {
        const w = overrides[e.workspaceId] ?? {};
        overrides = { ...overrides, [e.workspaceId]: { ...w, [e.blockId]: { ...w[e.blockId], [e.line]: e.state } } };
        verdict = { seq: ++verdictSeq, state: e.state, done: false };
      } else {
        taskDone = { ...taskDone, [e.workspaceId]: [...(taskDone[e.workspaceId] ?? []), e.blockId] };
      }
      publish();
    };

    let keepEvents = false;
    let failed = false;
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
        building = view.building || status !== null;
        publish();
      }, onEvent);
      sessionConfirmed = true;
      // A code-routed workspace turn ends with no reply at all; a typed turn always gets text or events.
      if (!raw.trim() && typed && !sawEvent) throw new TurnError("empty_reply", "the agent sent an empty reply");

      const view = parse(raw);
      const repeated = repeats(view) || (announceText !== null && norm(view.chat) === norm(announceText));
      if (raw.trim()) messages = [...messages, { role: "assistant", content: view.silent || repeated ? "[silent]" : raw }];
      if (view.silent || repeated || !(raw.trim() || gotWorkspace)) {
        removeBubble(agentId);
        agentId = null;
      } else {
        show(view, true);
      }
      if (view.html !== null) {
        pending = [];
        install(view.html, sentAt);
      }
    } catch (e) {
      const saved = e instanceof TurnError && e.code === "stream_lost" && sessionId ? await recover(sessionId, base) : null;
      if (saved) {
        restore(saved);
        return;
      }
      messages = messages.slice(0, base);
      removeBubble(agentId);
      removeBubble(announceId);
      const info = describeError(e);
      failed = true;
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
      status = null;
      buildingPhase = null;
      publish();
      if (typed) dom.focusInput(failed);
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
    optsClosedId = lastAgentId();
    if (busy) {
      queued = { text, photo: shot, bubbleId: addBubble({ kind: "student", text, photo: shot }) };
      publish();
      return Promise.resolve();
    }
    return runTurn(true, text, null, shot, via);
  }

  // Workspace events, from the legacy iframe or from WorkspaceView: batched and flushed 800 ms after the first.
  function enqueue(event: WorkspaceEvent) {
    pending = [...pending, event].slice(-MAX_PENDING);
    closeRestate();
    publish();
    if (timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        flush();
      }, FLUSH_DELAY_MS);
    }
  }

  const onMessage = (e: MessageEvent) => {
    const win = dom.frameWindow();
    const trusted = (win !== null && e.source === win) || (e.source !== null && customFrames.has(e.source as Window));
    if (!trusted || e.data?.dfriend !== true || typeof e.data.event !== "object") return;
    enqueue(e.data.event as WorkspaceEvent);
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

  function restore(saved: Saved) {
    messages = saved.messages;
    sessionId = saved.sessionId;
    sessionConfirmed = true;
    const structured = Object.keys(saved.workspaces).length > 0;
    workspaces = saved.workspaces;
    phase = saved.phase && workspaces[saved.phase] ? saved.phase : ((Object.keys(workspaces)[0] as Phase) ?? null);
    html = structured ? null : saved.html;
    overrides = {};
    taskDone = {};
    buildFailed = false;
    bubbles = [];
    restateClosedId = null;
    offerClosedId = null;
    optsClosedId = null;
    // By role, not by index: an announce and its reply are two assistant messages, and a code-routed
    // workspace batch is a user message with no reply.
    let said: string | null = null; // the previous assistant line, to drop an announce repeated as the reply
    for (const m of saved.messages) {
      if (m.role === "assistant") {
        const view = parse(m.content as string);
        if (view.chat && (said === null || norm(view.chat) !== said)) addBubble(agentBubble(view.chat, view));
        if (view.chat) said = norm(view.chat);
      } else {
        turnNo++;
        said = null;
        const view = studentView(m.content);
        if (view) addBubble({ kind: "student", text: view.text, photo: view.photo || null });
      }
    }
    // A trailing [silent] or workspace batch means something happened after the last visible agent message.
    const last = saved.messages.at(-1);
    if (last && (last.role === "user" || parse(last.content as string).chat === "")) {
      closeRestate();
      offerClosedId = lastAgentId();
      optsClosedId = lastAgentId();
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
        track("session_restored", {
          messages: applied.messages.length,
          has_workspace: applied.html !== null || Object.keys(applied.workspaces).length > 0,
        });
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

    async pickPhoto(file: Blob, source: "snap_button" | "composer_button" | "retake" | "paste" | "drop") {
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
      dom.focusInput(true);
    },

    chatOpened(unread: boolean) {
      track("chat_opened", { unread }, sid());
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
      dom.focusInput(true);
    },

    answerOffer(accepted: boolean): Promise<void> {
      track("similar_offer_answered", { accepted }, sid());
      offerClosedId = lastAgentId();
      publish();
      return accepted ? dispatch(copy.offerYesMessage, null) : Promise.resolve();
    },

    answerOpt(text: string): Promise<void> {
      return dispatch(text, null);
    },

    // From WorkspaceView. Same event shape as the iframe bridge; a master completion is not a student gesture.
    report(type: string, data?: unknown, byStudent = true) {
      if (type === "task_completed" && (data as { via?: string } | null | undefined)?.via === "master") byStudent = false;
      enqueue({ type, data: data ?? null, byStudent, gesture: byStudent ? now() : undefined });
    },

    setPhase(p: Phase) {
      activate(p);
      actions.report("phase_viewed", { phase: p });
    },

    check(workspaceId: string, blockId: string, answer: string, previous: string[], item?: number): Promise<CheckResponse> {
      const w = Object.values(workspaces).find((x) => x.id === workspaceId);
      if (!w || sessionId === null) return Promise.reject(new Error(`no workspace ${workspaceId}`));
      checking++;
      publish();
      return api.check(sessionId, { workspaceId, blockId, answer, previous, ...(item !== undefined && { item }) }).then((r) => {
        verdict = { seq: ++verdictSeq, state: r.state, done: r.done };
        // A master line_state judged the attempt it was issued for, not the next one at that line.
        // shortcut: the line is previous.length + 1, which is Steps' contract; other blocks hold no overrides.
        const line = previous.length + 1;
        const lines = overrides[workspaceId]?.[blockId];
        if (lines && line in lines) {
          const rest = { ...lines };
          delete rest[line];
          overrides = { ...overrides, [workspaceId]: { ...overrides[workspaceId], [blockId]: rest } };
          publish();
        }
        return r;
      }).finally(() => {
        checking--;
        publish();
      });
    },

    rebuild(): Promise<void> {
      return dispatch(copy.rebuildMessage, null);
    },

    newProblem() {
      if (busy) return;
      newProblems++;
      track("new_problem_clicked", { turns_in_session: Math.floor(messages.length / 2) }, sid());
      if (sessionId) api.endSession(sessionId, "new_problem").catch(() => {});
      clearTimer();
      messages = [];
      pending = [];
      queued = null;
      bubbles = [];
      html = null;
      workspaces = {};
      phase = null;
      verdict = { seq: verdictSeq, state: null, done: false };
      overrides = {};
      taskDone = {};
      building = false;
      status = null;
      buildingPhase = null;
      buildFailed = false;
      sessionId = null;
      sessionConfirmed = false;
      restateClosedId = null;
      offerClosedId = null;
    optsClosedId = null;
      publish();
    },
  };

  return {
    // Gives the controller the iframe's window (to filter messages) and a way to focus the composer.
    bind(d: { frameWindow: () => Window | null; focusInput: (reveal?: boolean) => void }) {
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
  // Set by PetLayer, which knows which composer is on screen.
  const inputRef = useRef<{ focus: (reveal?: boolean) => void } | null>(null);

  useEffect(() => {
    ws.bind({
      frameWindow: () => frameRef.current?.contentWindow ?? null,
      focusInput: (reveal) => inputRef.current?.focus(reveal),
    });
    const detach = ws.attach();
    ws.init();
    return detach;
  }, [ws]);

  return { ...state, ...ws.actions, frameRef, inputRef };
}
