// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  window.sessionStorage.clear();
  cleanup();
});

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Background: () => null,
  BackgroundVariant: { Dots: "dots" },
  Controls: () => null,
  MiniMap: () => null,
  SelectionMode: { Partial: "partial" },
  applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
}));

import { GraphPane } from "../src/components/GraphPane";
import type { PuzzleProject } from "../src/lib/project-types";

const project: PuzzleProject = {
  projectName: "viewer-test",
  writable: false,
  graph: {
    version: 1,
    title: "Viewer test",
    nodes: [
      {
        id: "first",
        title: "First puzzle",
        document: "docs/first.md",
        kind: "insight",
        summary: "Notice the important clue.",
        status: "tbd",
      },
    ],
    edges: [],
  },
  layout: { nodes: { first: { x: 20, y: 40 } }, edges: {} },
  documents: { "docs/first.md": "# First puzzle\n" },
};

describe("GraphPane viewer inspector", () => {
  it("shows selected node metadata read-only in view mode", () => {
    render(
      <GraphPane
        project={project}
        editable={false}
        selectedNodeId="first"
        onSelectNode={() => undefined}
        onProjectEdit={() => undefined}
        onViewportChange={() => undefined}
        canUndo={false}
        canRedo={false}
        onUndo={() => undefined}
        onRedo={() => undefined}
      />,
    );

    expect(screen.getByRole("complementary", { name: "Node properties" })).toBeTruthy();
    expect(screen.getByDisplayValue("First puzzle")).toHaveProperty(
      "readOnly",
      true,
    );
    expect(screen.getByDisplayValue("Insight")).toHaveProperty("disabled", true);
    expect(screen.getByDisplayValue("docs/first.md")).toHaveProperty(
      "readOnly",
      true,
    );
    expect(screen.queryByRole("button", { name: "Delete First puzzle" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Hide node properties" }));
    expect(screen.getByRole("button", { name: "Show node properties" })).toBeTruthy();
    expect(screen.queryByDisplayValue("First puzzle")).toBeNull();
  });
});
