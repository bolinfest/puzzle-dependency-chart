import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import {
  parseGraph,
  parseLayout,
  type GraphLayout,
  type PuzzleGraph,
  type PuzzleProject,
} from "../lib/project-types.ts";
import {
  serializeGraphYaml,
  serializeLayoutJson,
} from "../lib/project-serialization.ts";
import { hydrateGraphTodoEffects } from "../lib/todo-markdown.ts";

function resolveProjectPath(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Project paths must be relative: ${relativePath}`);
  }
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path leaves the project folder: ${relativePath}`);
  }
  return resolved;
}

async function atomicWrite(filename: string, contents: string): Promise<void> {
  const temporary = `${filename}.pdc-tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, filename);
}

export async function loadPuzzleProject(
  root: string,
  writable: boolean,
): Promise<PuzzleProject> {
  const [graphText, layoutText] = await Promise.all([
    readFile(path.join(root, "graph.yaml"), "utf8"),
    readFile(path.join(root, "layout.json"), "utf8"),
  ]);
  const graph = parseGraph(parse(graphText));
  const layout = parseLayout(JSON.parse(layoutText) as unknown);
  const documents: Record<string, string> = {};

  await Promise.all(
    graph.nodes.map(async (node) => {
      if (path.extname(node.document).toLowerCase() !== ".md") {
        throw new Error(`Puzzle document must be a .md file: ${node.document}`);
      }
      documents[node.document] = await readFile(
        resolveProjectPath(root, node.document),
        "utf8",
      );
    }),
  );

  const hydratedGraph = hydrateGraphTodoEffects(graph, documents);

  return {
    projectName: path.basename(root),
    graph: hydratedGraph,
    layout,
    documents,
    writable,
  };
}

export async function savePuzzleDocument(
  root: string,
  documentPath: string,
  markdown: string,
): Promise<void> {
  if (path.extname(documentPath).toLowerCase() !== ".md") {
    throw new Error("Only Markdown puzzle documents can be written.");
  }
  const filename = resolveProjectPath(root, documentPath);
  await mkdir(path.dirname(filename), { recursive: true });
  await atomicWrite(filename, markdown);
}

export async function savePuzzleGraph(
  root: string,
  value: unknown,
  initialDocuments: Record<string, string> = {},
): Promise<PuzzleGraph> {
  const graph = parseGraph(value);
  const visitedDocuments = new Set<string>();

  for (const node of graph.nodes) {
    if (path.extname(node.document).toLowerCase() !== ".md") {
      throw new Error(`Puzzle document must be a .md file: ${node.document}`);
    }
    const filename = resolveProjectPath(root, node.document);
    if (visitedDocuments.has(filename)) continue;
    visitedDocuments.add(filename);
    try {
      await readFile(filename, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(path.dirname(filename), { recursive: true });
      const initialMarkdown =
        initialDocuments[node.document] ??
        `# ${node.title}\n\nDescribe this puzzle, its clues, and its solution.\n`;
      await atomicWrite(filename, initialMarkdown);
    }
  }

  await atomicWrite(
    path.join(root, "graph.yaml"),
    serializeGraphYaml(graph),
  );
  return graph;
}

export async function saveGraphLayout(
  root: string,
  value: unknown,
): Promise<GraphLayout> {
  const layout = parseLayout(value);
  await atomicWrite(
    path.join(root, "layout.json"),
    serializeLayoutJson(layout),
  );
  return layout;
}
