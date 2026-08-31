import {
  MarkerType,
  type Edge,
  type Node,
  type Viewport,
} from "@xyflow/react";
import type {
  EdgeRoute,
  GraphLayout,
  PuzzleNodeDefinition,
  PuzzleProject,
} from "./project-types";

export interface PuzzleNodeData extends Record<string, unknown> {
  definition: PuzzleNodeDefinition;
}

export type PuzzleFlowNode = Node<PuzzleNodeData, "puzzle">;

export function reactFlowEdgeType(route: EdgeRoute): string {
  return route === "bezier" ? "default" : route;
}

export function makeFlowNodes(project: PuzzleProject): PuzzleFlowNode[] {
  return project.graph.nodes.map((definition, index) => ({
    id: definition.id,
    type: "puzzle",
    position: project.layout.nodes[definition.id] ?? {
      x: 80 + (index % 2) * 280,
      y: 80 + Math.floor(index / 2) * 160,
    },
    data: { definition },
  }));
}

export function makeFlowEdges(project: PuzzleProject): Edge[] {
  return project.graph.edges.map((definition) => {
    const route = project.layout.edges[definition.id] ?? { type: "bezier" };
    return {
      id: definition.id,
      source: definition.from,
      target: definition.to,
      label: definition.label,
      type: reactFlowEdgeType(route.type),
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { strokeWidth: 1.75 },
      pathOptions: {
        ...(typeof route.curvature === "number"
          ? { curvature: route.curvature }
          : {}),
        ...(typeof route.borderRadius === "number"
          ? { borderRadius: route.borderRadius }
          : {}),
        ...(typeof route.offset === "number" ? { offset: route.offset } : {}),
      },
    } as Edge;
  });
}

export function layoutWithNodePositions(
  layout: GraphLayout,
  movedNodes: Array<Pick<PuzzleFlowNode, "id" | "position">>,
): GraphLayout | undefined {
  let changed = false;
  const positions = { ...layout.nodes };
  for (const node of movedNodes) {
    const previous = layout.nodes[node.id];
    if (
      previous?.x === node.position.x &&
      previous?.y === node.position.y
    ) {
      continue;
    }
    positions[node.id] = { x: node.position.x, y: node.position.y };
    changed = true;
  }
  return changed ? { ...layout, nodes: positions } : undefined;
}

export const fallbackViewport: Viewport = { x: 40, y: 28, zoom: 0.82 };
