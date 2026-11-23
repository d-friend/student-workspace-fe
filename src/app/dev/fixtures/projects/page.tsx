import { notFound } from "next/navigation";
import { ProjectsFixtureView } from "./ProjectsFixtureView";

// Visual-test harness: the sidebar with fixture projects and chats in the real shell, no backend. Only reachable when built with NEXT_PUBLIC_FIXTURES=1.
export default async function Page({ searchParams }: { searchParams: Promise<{ n?: string; active?: string }> }) {
  if (process.env.NEXT_PUBLIC_FIXTURES !== "1") notFound();
  const { n, active } = await searchParams;
  return <ProjectsFixtureView count={Number(n) || undefined} active={active} />;
}
