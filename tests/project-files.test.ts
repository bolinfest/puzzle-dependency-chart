import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  loadPuzzleProject,
  savePuzzleGraph,
} from "../src/server/project-files";
import { markdownWithoutTodoMetadata } from "../src/lib/todo-markdown";

const exampleRoot = fileURLToPath(
  new URL("../examples/fox-chicken-grain", import.meta.url),
);
const branchingExampleRoot = fileURLToPath(
  new URL("../examples/clockwork-lighthouse", import.meta.url),
);

describe("puzzle project files", () => {
  it("loads graph, layout, and Markdown from nested paths", async () => {
    const project = await loadPuzzleProject(exampleRoot, true);

    expect(project.graph.title).toBe("The Fox, Chicken & Grain");
    expect(project.graph.nodes).toHaveLength(10);
    expect(project.graph.edges).toHaveLength(9);
    expect(project.documents["docs/rules/boat-capacity.md"]).toContain(
      "small rowboat",
    );
    expect(project.documents["notes/all-safe.md"]).toContain(
      "seven crossings",
    );
    expect(project.layout.nodes["all-safe"]).toEqual({ x: 190, y: 1310 });
    expect(project.writable).toBe(true);
  });

  it("loads conversation, TODO effect, and TBD metadata", async () => {
    const project = await loadPuzzleProject(branchingExampleRoot, false);

    expect(project.graph.nodes).toHaveLength(18);
    expect(
      project.graph.nodes.find((node) => node.id === "meet-keeper"),
    ).toMatchObject({
      kind: "conversation",
      todo: [
        {
          id: "relight-beacon",
          action: "add",
          order: 10,
        },
        {
          id: "restore-fuel-supply",
          action: "add",
          parentId: "relight-beacon",
          order: 10,
        },
        {
          id: "replace-lighthouse-lens",
          action: "add",
          parentId: "relight-beacon",
          order: 20,
        },
        {
          id: "repair-rotation-clockwork",
          action: "add",
          parentId: "relight-beacon",
          order: 30,
        },
        {
          id: "set-warning-sequence",
          action: "add",
          parentId: "relight-beacon",
          order: 40,
        },
      ],
    });
    expect(
      project.graph.nodes.find((node) => node.id === "shape-replacement-lens"),
    ).toMatchObject({ status: "tbd" });
    expect(
      project.graph.nodes.find((node) => node.id === "talk-to-ferryman"),
    ).toMatchObject({
      todo: [
        {
          id: "recover-compass",
          action: "add",
          parentId: "restore-fuel-supply",
          order: 10,
        },
      ],
    });
    expect(
      project.graph.nodes.find((node) => node.id === "fill-reservoir"),
    ).toMatchObject({
      todo: [{ id: "restore-fuel-supply", action: "complete" }],
    });
    expect(
      project.graph.nodes.find((node) => node.id === "install-lens"),
    ).toMatchObject({
      todo: [{ id: "replace-lighthouse-lens", action: "complete" }],
    });
    expect(
      project.graph.nodes.find((node) => node.id === "repair-clockwork"),
    ).toMatchObject({
      todo: [{ id: "repair-rotation-clockwork", action: "complete" }],
    });
    expect(
      project.graph.nodes.find((node) => node.id === "set-flash-sequence"),
    ).toMatchObject({
      todo: [{ id: "set-warning-sequence", action: "complete" }],
    });
    expect(project.graph.edges.filter((edge) => edge.from === "meet-keeper")).toHaveLength(
      5,
    );
    for (const node of project.graph.nodes.filter((item) => item.todo?.length)) {
      expect(
        markdownWithoutTodoMetadata(project.documents[node.document]),
      ).not.toMatch(/\bTODO\b/i);
    }
  });

  it("writes a validated graph and creates a new Markdown document", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pdc-graph-test-"));
    try {
      const graph = {
        version: 1 as const,
        title: "Editable test",
        nodes: [
          {
            id: "new-node",
            title: "New node",
            document: "nested/new-node.md",
            kind: "conversation",
            status: "tbd",
            todo: [
              {
                id: "ask-around",
                action: "add",
                label: "Ask around",
                parentId: "chapter-goal",
                order: 20,
              },
            ],
          },
        ],
        edges: [],
      };

      await savePuzzleGraph(root, graph, {
        "nested/new-node.md": "# Authored content\n",
      });

      const graphYaml = await readFile(path.join(root, "graph.yaml"), "utf8");
      expect(graphYaml).toContain("kind: conversation");
      expect(graphYaml).not.toContain("todo:");
      expect(
        await readFile(path.join(root, "nested/new-node.md"), "utf8"),
      ).toBe("# Authored content\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
