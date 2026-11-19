import { notFound } from "next/navigation";
import { TreeFixtureView } from "./TreeFixtureView";

// Visual-test harness: the progress tree with fixture data in the real shell, no backend. Only reachable when built with NEXT_PUBLIC_FIXTURES=1.
export default function Page() {
  if (process.env.NEXT_PUBLIC_FIXTURES !== "1") notFound();
  return <TreeFixtureView />;
}
