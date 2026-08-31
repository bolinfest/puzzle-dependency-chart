import { strToU8, zipSync } from "fflate";
import { stringify as stringifyYaml } from "yaml";
import {
  type GraphLayout,
  type PuzzleGraph,
  type PuzzleProject,
  parseGraph,
  validateProjectDocumentPath,
} from "./project-types.ts";

export function graphWithoutDerivedTodo(graph: PuzzleGraph): PuzzleGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(({ todo: _derivedTodo, ...node }) => node),
  };
}

export function serializeGraphYaml(graph: PuzzleGraph): string {
  return stringifyYaml(graphWithoutDerivedTodo(graph), { lineWidth: 0 });
}

export function serializeLayoutJson(layout: GraphLayout): string {
  return `${JSON.stringify(layout, null, 2)}\n`;
}

export function projectSourceFiles(
  project: PuzzleProject,
): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [path, markdown] of Object.entries(project.documents)) {
    files[validateProjectDocumentPath(path)] = markdown;
  }
  const graph = parseGraph(project.graph);
  for (const node of graph.nodes) {
    if (!(node.document in files)) {
      throw new Error(`Project is missing ${node.document}.`);
    }
  }
  files["graph.yaml"] = serializeGraphYaml(graph);
  files["layout.json"] = serializeLayoutJson(project.layout);
  return files;
}

export function createProjectZip(project: PuzzleProject): Uint8Array {
  const files = Object.fromEntries(
    Object.entries(projectSourceFiles(project)).map(([path, contents]) => [
      path,
      strToU8(contents),
    ]),
  );
  return zipSync(files, { level: 6 });
}

export function safeProjectFilename(projectName: string): string {
  const filename = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return filename || "puzzle-chart";
}
