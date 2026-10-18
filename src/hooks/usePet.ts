// The pet's mood from the workspace snapshot (spec §4.1, §4.2). The store owns the facts (turns, verdicts,
// checks); this hook owns what is only about feel: the short windows after an event, and the typing signal.
import { useCallback, useEffect, useState } from "react";

import type { Bubble, WorkspaceState } from "@/hooks/useWorkspace";
import { petMood, type PetMood } from "@/lib/pet";

const OK_MS = 1300;
const DONE_MS = 2400;
const TALK_AFTER_MS = 1800;
const TYPING_MS = 2500;

type PetSignals = Pick<WorkspaceState, "bubbles" | "busy" | "building" | "checking" | "verdict" | "taskDone">;

// What the hook remembers from earlier snapshots, so it can tell a new event from an old one.
type Memo = {
  busy: boolean;
  idleMax: number; // highest bubble id while no turn ran
  base: number; // idleMax when the current turn started: its bubbles have higher ids
  seq: number;
  done: number;
  happyKey: number;
  happyMs: number;
  happyOn: boolean;
  spoke: number | null; // the bubble the last finished turn spoke in
  holdKey: number;
  holdOn: boolean;
};

const maxId = (b: Bubble[]) => b.reduce((m, x) => Math.max(m, x.id), -1);
const doneCount = (t: WorkspaceState["taskDone"]) => Object.values(t).flat().length;

// The latest agent bubble, if this turn created it. An announce is inserted before the waiting one, so
// position, not id, decides which is latest.
function turnAgent(bubbles: Bubble[], base: number) {
  const a = bubbles.findLast((b) => b.kind === "agent");
  return a?.kind === "agent" && a.id > base ? a : null;
}

// s is the useWorkspace snapshot. celebrate() is for the entry: photo picked, pet tapped with no conversation.
export function usePet(s: PetSignals): {
  mood: PetMood;
  celebrate: () => void;
  celebrateKey: number; // bumps on every happy start, so Pet replays the jump
} {
  // Seeded from the first snapshot, so a restored session starts idle instead of celebrating its history.
  const [m, setM] = useState<Memo>(() => ({
    busy: s.busy,
    idleMax: maxId(s.bubbles),
    base: maxId(s.bubbles),
    seq: s.verdict.seq,
    done: doneCount(s.taskDone),
    happyKey: 0,
    happyMs: OK_MS,
    happyOn: false,
    spoke: null,
    holdKey: 0,
    holdOn: false,
  }));
  const [typing, setTyping] = useState(false);

  // Edges are found while rendering (React's "adjust state when a prop changes"), so the first frame after
  // an event already shows the right mood.
  // shortcut: a turn that starts in the same tick another ends (a queued message, an auto-flushed batch)
  // reaches React as one snapshot, so that turn keeps the previous turn's base; split busy into a turn id
  // in the store if the pet is seen talking through a reading turn.
  let next = m;
  if (s.busy !== m.busy) {
    if (s.busy) {
      next = { ...next, busy: true, base: m.idleMax, holdOn: false };
    } else {
      const a = turnAgent(s.bubbles, m.base);
      next =
        a && !a.waiting
          ? { ...next, busy: false, spoke: a.id, holdOn: true, holdKey: m.holdKey + 1 }
          : { ...next, busy: false };
    }
  }
  const max = maxId(s.bubbles);
  if (!s.busy && max !== next.idleMax) next = { ...next, idleMax: max };
  const done = doneCount(s.taskDone);
  if (s.verdict.seq !== m.seq || done !== m.done) {
    const ok = s.verdict.seq !== m.seq && s.verdict.state === "ok";
    // task_done from the agent's complete_task only grows taskDone; it never touches verdict.
    const grew = done > m.done;
    next = { ...next, seq: s.verdict.seq, done };
    if (ok || grew) {
      const happyMs = grew || s.verdict.done ? DONE_MS : OK_MS;
      next = { ...next, happyKey: next.happyKey + 1, happyOn: true, happyMs };
    }
  }
  if (next !== m) setM(next);

  const { happyKey, happyOn, happyMs, holdKey, holdOn } = m;
  useEffect(() => {
    if (!happyOn) return;
    const t = setTimeout(() => setM((x) => (x.happyKey === happyKey ? { ...x, happyOn: false } : x)), happyMs);
    return () => clearTimeout(t);
  }, [happyKey, happyOn, happyMs]);

  useEffect(() => {
    if (!holdOn) return;
    const t = setTimeout(() => setM((x) => (x.holdKey === holdKey ? { ...x, holdOn: false } : x)), TALK_AFTER_MS);
    return () => clearTimeout(t);
  }, [holdKey, holdOn]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(t);
      setTyping(false);
    };
    const onInput = (e: Event) => {
      if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) return;
      clearTimeout(t);
      setTyping(true);
      t = setTimeout(stop, TYPING_MS);
    };
    // Bubble phase, not capture: setState before React's own onChange handler runs makes React reset a controlled
    // input to its old value, which swallowed the first keystroke of every composer.
    document.addEventListener("input", onInput);
    document.addEventListener("focusout", stop, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("input", onInput);
      document.removeEventListener("focusout", stop, true);
    };
  }, []);

  const celebrate = useCallback(
    () => setM((x) => ({ ...x, happyKey: x.happyKey + 1, happyOn: true, happyMs: OK_MS })),
    [],
  );

  const a = s.busy ? turnAgent(s.bubbles, next.base) : null;
  const mood = petMood({
    celebrating: next.happyOn,
    composing: s.busy && !s.building && !!a?.waiting,
    // A build is not speech: its "building" placeholder text would move the mouth for the whole build.
    talking:
      (s.busy && !s.building && !!a && !a.waiting) ||
      // Only while that bubble is still there: newProblem or a restore clears it.
      (next.holdOn && s.bubbles.some((b) => b.id === next.spoke)),
    doubting: s.verdict.state === "review" && s.checking === 0,
    working: (s.busy && !a) || s.building || s.checking > 0,
    typing,
  });
  return { mood, celebrate, celebrateKey: next.happyKey };
}
