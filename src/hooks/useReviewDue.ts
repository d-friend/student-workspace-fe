import { useEffect, useState } from "react";
import { getReviewCount } from "@/lib/api";

// Cards due across the student's subjects, for the home chip: the total, and the subject with the most (where the chip goes). A failed load shows no chip.
export function useReviewDue(): { due: number; projectId: string } | null {
  const [due, setDue] = useState<{ due: number; projectId: string } | null>(null);
  useEffect(() => {
    let active = true;
    getReviewCount().then(projects => {
      const top = projects.reduce<(typeof projects)[number] | null>((best, p) => p.due > (best?.due ?? 0) ? p : best, null);
      if (active) setDue(top ? { due: projects.reduce((sum, p) => sum + p.due, 0), projectId: top.project_id } : null);
    }, () => {});
    return () => { active = false; };
  }, []);
  return due;
}
