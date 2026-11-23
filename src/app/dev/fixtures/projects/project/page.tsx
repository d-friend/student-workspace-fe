import { notFound } from "next/navigation";
import { ProjectFixtureView } from "./ProjectFixtureView";
import { projectViews } from "../projectsFixture";

// Visual-test harness: a project page with fixture data in the real shell, no backend. ?id=<project id>&tab=map|sessions|sources&block=<block id>.
// Only reachable when built with NEXT_PUBLIC_FIXTURES=1.
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; tab?: string; block?: string }> }) {
  if (process.env.NEXT_PUBLIC_FIXTURES !== "1") notFound();
  const { id, tab, block } = await searchParams;
  const project = id ? projectViews[id] : Object.values(projectViews)[0];
  if (!project) notFound();
  return <ProjectFixtureView projectId={project.id} tab={tab} block={block} />;
}
