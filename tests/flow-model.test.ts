import { describe, expect, it } from "vitest";
import {
  layoutWithNodePositions,
  makeFlowEdges,
  reactFlowEdgeType,
} from "../src/lib/flow-model";
import type { PuzzleProject } from "../src/lib/project-types";

describe("React Flow model", () => {
  it("translates the source-control route names at the React Flow boundary", () => {
    expect(reactFlowEdgeType("straight")).toBe("straight");
    expect(reactFlowEdgeType("bezier")).toBe("default");
    expect(reactFlowEdgeType("smoothstep")).toBe("smoothstep");
  });

  it("applies per-edge routing options", () => {
    const project = {
      graph: {
        version: 1,
        title: "Test",
        nodes: [],
        edges: [{ id: "e1", from: "a", to: "b" }],
      },
      layout: {
        nodes: {},
        edges: { e1: { type: "bezier", curvature: 0.4 } },
      },
      documents: {},
      projectName: "test",
      writable: false,
    } satisfies PuzzleProject;

    expect(makeFlowEdges(project)[0]).toMatchObject({
      id: "e1",
      source: "a",
      target: "b",
      type: "default",
      pathOptions: { curvature: 0.4 },
    });
  });

  it("persists every node in a group drag without changing edge layout", () => {
    const layout = {
      nodes: {
        a: { x: 10, y: 20 },
        b: { x: 30, y: 40 },
        c: { x: 50, y: 60 },
      },
      edges: { edge: { type: "straight" as const } },
    };

    expect(
      layoutWithNodePositions(layout, [
        { id: "a", position: { x: 110, y: 120 } },
        { id: "b", position: { x: 130, y: 140 } },
      ]),
    ).toEqual({
      nodes: {
        a: { x: 110, y: 120 },
        b: { x: 130, y: 140 },
        c: { x: 50, y: 60 },
      },
      edges: layout.edges,
    });
  });

  it("does not create a drag transaction when positions did not change", () => {
    const layout = { nodes: { a: { x: 10, y: 20 } }, edges: {} };
    expect(
      layoutWithNodePositions(layout, [
        { id: "a", position: { x: 10, y: 20 } },
      ]),
    ).toBeUndefined();
  });
});
