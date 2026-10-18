export type Phase = "learn" | "solve" | "practice";

export type QuizAnswer = "choice" | "number" | "exact" | "expr" | "open";
export type GeometryTool = "point" | "segment" | "line" | "circle" | "midpoint" | "perpendicular" | "parallel" | "angle";

export type ScaffoldItem = { kind: "choice"; prompt: string; options: string[] } | { kind: "blank"; template: string };

// Mirrors backend/app/workspace_doc.py (spec-workspace section 3). Ids match ^[a-z][a-z0-9_]{0,23}$ and are unique per doc.
export type Block =
  | { type: "heading"; id: string; text: string; level: 2 | 3 }
  | { type: "text"; id: string; md: string }
  | { type: "math"; id: string; tex: string }
  | { type: "image"; id: string; src: string; alt: string; caption?: string; credit: string; source_url: string }
  | { type: "callout"; id: string; tone: "idea" | "remember" | "warning"; md: string }
  | { type: "example"; id: string; title: string; problem_md: string; steps: string[] }
  | { type: "quiz"; id: string; question_md: string; answer: QuizAnswer; options?: string[]; explanation_md: string }
  | { type: "problem"; id: string; md: string; image?: { src: string; alt: string } }
  | { type: "steps"; id: string; problem_id: string; input: "math" | "text"; help?: string; scaffold?: ScaffoldItem[] }
  | {
      type: "graph";
      id: string;
      fns: { expr: string; label: string }[];
      x: [number, number];
      y?: [number, number];
      points?: { x: number; y: number; label: string }[];
      sliders?: { name: string; min: number; max: number; value: number }[];
    }
  | {
      type: "geometry";
      id: string;
      points: { id: string; x: number; y: number }[];
      segments?: [string, string][];
      circles?: { center: string; through: string }[];
      tools: GeometryTool[];
    }
  | { type: "custom"; id: string; html: string; height: number; reason: string };

export type WorkspaceDoc = {
  version: 1;
  phase: Phase;
  title: string;
  blocks: Block[];
  sources: { url: string; title: string }[];
};

export type Workspace = { id: string; doc: WorkspaceDoc };

export type CheckResponse = {
  ok: boolean;
  state: "ok" | "review";
  done: boolean;
  reached?: string | null;
  message?: string | null;
};

export type LineState = "ok" | "review" | "pending" | "error";

export type BlockCtx = {
  workspaceId: string;
  phase: Phase;
  report: (type: string, data?: unknown) => void;
  check: (blockId: string, answer: string, previous: string[], item?: number) => Promise<CheckResponse>; // item: scaffold index
  overrides: Record<string, Record<number, "ok" | "review">>; // from SSE line_state, by block id
  hintCount: number; // "Gợi ý" presses in this doc
  onSolved: (blockId: string) => void; // a steps block reached its final checkpoint
  help: { level: number; onHint: () => void; onIdea?: () => void } | null; // Doc sets it; Steps shows it in its active row
  hidden?: boolean; // Doc sets it: this doc is not the shown phase (it stays mounted), so its blocks give up the pet anchor
};

export type BlockProps<B> = { block: B; ctx: BlockCtx };
