export type StageEntry = {
  item?: number;
  state: "ok" | "review";
  tries?: number;
  hint?: number;
  wrong?: string;
};

export type StageResult = {
  stage: number;
  result: "first" | "hint" | "fixed" | "todo" | "unknown";
  n?: number;
  wrong?: string;
};

export function stageResults(stages: (number | null | undefined)[], entries: StageEntry[], free = false): StageResult[] {
  if (free) return [];
  const groups = new Map<number, (StageEntry | undefined)[]>();
  stages.forEach((stage, item) => {
    if (stage == null) return;
    const accepted = entries.find((entry, index) => (entry.item ?? index) === item && entry.state === "ok");
    const group = groups.get(stage) ?? [];
    group.push(accepted);
    groups.set(stage, group);
  });
  return [...groups].sort(([a], [b]) => a - b).map(([stage, items]): StageResult => {
    if (items.some(item => !item)) return { stage, result: "todo" };
    const hint = Math.max(...items.map(item => item?.hint ?? 0));
    const fixes = items.reduce((sum, item) => sum + Math.max(0, (item?.tries ?? 1) - 1), 0);
    const wrong = items.find(item => item?.wrong)?.wrong;
    if (hint >= 1) return { stage, result: "hint", n: hint, ...(wrong && { wrong }) };
    if (fixes > 0) return { stage, result: "fixed", n: fixes, ...(wrong && { wrong }) };
    if (items.some(item => item?.tries === undefined)) return { stage, result: "unknown" };
    return { stage, result: "first" };
  });
}
