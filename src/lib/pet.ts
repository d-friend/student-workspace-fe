export type PetMood = "idle" | "listening" | "thinking" | "working" | "talking" | "happy" | "doubt";

// usePet time-boxes each flag; priority is the order below (spec §4.1).
export type PetInputs = {
  celebrating: boolean; // a new ok verdict within 1.3 s (done: 2.4 s), a photo pick, an entry tap
  composing: boolean; // about to speak: the latest agent bubble is waiting and the build is over
  talking: boolean; // agent text streaming, or finished within 1.8 s
  doubting: boolean; // the latest verdict is review and no check is in flight; held, not timed
  working: boolean; // busy with no agent bubble, building, or a /check in flight
  typing: boolean; // student keystrokes within 2.5 s
};

export function petMood(i: PetInputs): PetMood {
  if (i.celebrating) return "happy";
  if (i.composing) return "thinking";
  if (i.talking) return "talking";
  if (i.doubting) return "doubt";
  if (i.working) return "working";
  if (i.typing) return "listening";
  return "idle";
}
