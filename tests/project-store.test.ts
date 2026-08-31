import "fake-indexeddb/auto";
import { strFromU8, unzipSync } from "fflate";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localDraftKey } from "../src/lib/local-draft";
import {
  createProjectZip,
  projectSourceFiles,
} from "../src/lib/project-serialization";
import {
  createInitialProjectStore,
  IndexedDbProjectStore,
} from "../src/lib/project-store";
import type { PuzzleProject } from "../src/lib/project-types";

function exampleProject(): PuzzleProject {
  return {
    projectName: "storage-test",
    writable: false,
    graph: {
      version: 1,
      title: "Storage test",
      nodes: [
        {
          id: "first",
          title: "First puzzle",
          document: "docs/first.md",
          kind: "move",
          todo: [{ id: "first-task", action: "add", label: "First task" }],
        },
      ],
      edges: [],
    },
    layout: {
      nodes: { first: { x: 20, y: 40 } },
      edges: {},
    },
    documents: {
      "docs/first.md": `<!-- puzzle-chart:todo-effects
- action: add
  id: first-task
  label: First task
-->

# First puzzle
`,
    },
  };
}

describe("project stores", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads and saves through the writable source-store boundary", async () => {
    const sourceProject = { ...exampleProject(), writable: true };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(sourceProject), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const store = createInitialProjectStore("/__pdc/project", true);
    const loaded = await store.load();
    await store.save(loaded.project, {
      documents: { "docs/first.md": "# Revised\n" },
    });

    expect(store.kind).toBe("source");
    expect(loaded.project.writable).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/__pdc/project");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/__pdc/state",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
    ).toEqual({ documents: { "docs/first.md": "# Revised\n" } });
  });

  it("persists, reloads, and resets a complete IndexedDB draft", async () => {
    const baseline = exampleProject();
    const key = localDraftKey(baseline, `/test-${crypto.randomUUID()}/`);
    const store = new IndexedDbProjectStore(key, baseline);

    const initial = await store.load();
    expect(initial.persisted).toBe(false);
    expect(initial.project.writable).toBe(true);

    initial.project.graph.title = "Locally revised";
    initial.project.documents["docs/first.md"] = "# Locally revised\n";
    await store.save(initial.project, {
      graph: initial.project.graph,
      documents: initial.project.documents,
    });

    const reloaded = await new IndexedDbProjectStore(key, baseline).load();
    expect(reloaded.persisted).toBe(true);
    expect(reloaded.project.graph.title).toBe("Locally revised");
    expect(reloaded.project.documents["docs/first.md"]).toBe(
      "# Locally revised\n",
    );

    await store.reset?.();
    const reset = await store.load();
    expect(reset.persisted).toBe(false);
    expect(reset.project.graph.title).toBe("Storage test");
  });

  it("exports source files without derived graph TODO data", () => {
    const project = exampleProject();
    const files = projectSourceFiles(project);
    const graph = parseYaml(files["graph.yaml"]) as {
      nodes: Array<{ todo?: unknown }>;
    };

    expect(graph.nodes[0]?.todo).toBeUndefined();
    expect(files["layout.json"]).toContain('"first"');
    expect(files["docs/first.md"]).toContain("puzzle-chart:todo-effects");

    const archive = unzipSync(createProjectZip(project));
    expect(Object.keys(archive).sort()).toEqual([
      "docs/first.md",
      "graph.yaml",
      "layout.json",
    ]);
    expect(strFromU8(archive["docs/first.md"]!)).toBe(
      project.documents["docs/first.md"],
    );
  });

  it("rejects unsafe document paths before creating an archive", () => {
    const project = exampleProject();
    project.documents["../outside.md"] = "# Unsafe\n";
    expect(() => projectSourceFiles(project)).toThrow(
      "Puzzle document must be a normalized relative path.",
    );
  });
});
