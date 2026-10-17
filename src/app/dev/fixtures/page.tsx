import { notFound } from "next/navigation";
import { fixtures } from "@/workspace/fixtures";
import { FixtureView } from "./FixtureView";

// Visual-test harness: a fixture doc in the real shell. Only reachable when the server was built with NEXT_PUBLIC_FIXTURES=1.
export default async function Page({ searchParams }: { searchParams: Promise<{ f?: string; pill?: string }> }) {
  if (process.env.NEXT_PUBLIC_FIXTURES !== "1") notFound();
  const { f, pill } = await searchParams;
  const doc = fixtures[`${f}.json`];
  if (!doc) notFound();
  return <FixtureView doc={doc} pill={pill === "1"} />;
}
