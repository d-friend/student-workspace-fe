import { useEffect, useState } from "react";
import { getReviewCount, listProjects } from "@/lib/api";

export type ReviewChip = { due: number; projectId: string; subject: string; examTomorrow: boolean };

// The follow-up chip on home: the subject with the most cards waiting, its name, and whether a review of it has its test tomorrow. A failed load shows no chip.
export function useReviewDue(): ReviewChip | null {
  const [chip, setChip] = useState<ReviewChip | null>(null);
  useEffect(() => {
    let active = true;
    getReviewCount().then(async projects => {
      const top = projects.reduce<(typeof projects)[number] | null>((best, p) => p.due > (best?.due ?? 0) ? p : best, null);
      if (!top) return;
      const subject = (await listProjects()).find(p => p.id === top.project_id)?.name;
      if (active && subject) setChip({ due: top.due, projectId: top.project_id, subject, examTomorrow: top.exam_tomorrow });
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  return chip;
}
