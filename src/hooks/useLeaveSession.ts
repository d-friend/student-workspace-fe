import { useCallback, useRef, useState } from "react";
import { currentSession, endSession } from "@/lib/api";
import { track } from "@/lib/track";

// Ends the open problem, then goes to `destination`. Resolves true when it is navigating, false when it stayed (ending failed, or one is already running). The open session must end first, or home would restore it instead of starting fresh.
export function useLeaveSession(): { leave: (destination: string, asNewProblem: boolean) => Promise<boolean>; failed: boolean } {
  const starting = useRef(false);
  const [failed, setFailed] = useState(false);
  const leave = useCallback(async (destination: string, asNewProblem: boolean): Promise<boolean> => {
    if (starting.current) return false;
    starting.current = true;
    setFailed(false);
    try {
      const session = await currentSession();
      if (asNewProblem) track("new_problem_clicked", { turns_in_session: Math.floor((session?.messages.length ?? 0) / 2) }, session?.sessionId);
      if (session) await endSession(session.sessionId, "new_problem");
      window.location.assign(destination);
      return true;
    } catch {
      // Stay here if ending fails, so home cannot silently restore the old problem.
      setFailed(true);
      return false;
    } finally {
      starting.current = false;
    }
  }, []);
  return { leave, failed };
}
