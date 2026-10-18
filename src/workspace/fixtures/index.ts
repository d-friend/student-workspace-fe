import type { WorkspaceDoc } from "../types";
import callout from "./callout.json";
import custom from "./custom.json";
import example from "./example.json";
import geometry from "./geometry.json";
import graph from "./graph.json";
import heading from "./heading.json";
import image from "./image.json";
import learn_derivative from "./learn-derivative.json";
import learn_history from "./learn-history.json";
import math from "./math.json";
import problem from "./problem.json";
import quiz from "./quiz.json";
import solve_tangent from "./solve-tangent.json";
import steps from "./steps.json";
import steps_scaffold from "./steps-scaffold.json";
import text from "./text.json";

// JSON imports widen literals ("learn" becomes string), so the cast is unchecked here; fixtures.test.ts enforces the schema rules.
const raw: Record<string, unknown> = {
  "callout.json": callout,
  "custom.json": custom,
  "example.json": example,
  "geometry.json": geometry,
  "graph.json": graph,
  "heading.json": heading,
  "image.json": image,
  "learn-derivative.json": learn_derivative,
  "learn-history.json": learn_history,
  "math.json": math,
  "problem.json": problem,
  "quiz.json": quiz,
  "solve-tangent.json": solve_tangent,
  "steps-scaffold.json": steps_scaffold,
  "steps.json": steps,
  "text.json": text,
};

export const fixtures = raw as Record<string, WorkspaceDoc>;
