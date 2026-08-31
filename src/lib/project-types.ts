export const puzzleKinds = [
  "constraint",
  "insight",
  "move",
  "conversation",
  "goal",
] as const;

export type PuzzleKind = (typeof puzzleKinds)[number];
export type EdgeRoute = "straight" | "bezier" | "step" | "smoothstep";
export type TodoAction = "add" | "complete" | "remove";

export interface TodoEffect {
  id: string;
  action: TodoAction;
  label?: string;
  parentId?: string;
  order?: number;
}

export interface PuzzleNodeDefinition {
  id: string;
  title: string;
  document: string;
  kind: PuzzleKind;
  summary?: string;
  status?: "tbd";
  todo?: TodoEffect[];
}

export interface PuzzleEdgeDefinition {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface PuzzleGraph {
  version: 1;
  title: string;
  description?: string;
  nodes: PuzzleNodeDefinition[];
  edges: PuzzleEdgeDefinition[];
}

export interface NodeLayout {
  x: number;
  y: number;
}

export interface EdgeLayout {
  type: EdgeRoute;
  curvature?: number;
  borderRadius?: number;
  offset?: number;
}

export interface GraphLayout {
  nodes: Record<string, NodeLayout>;
  edges: Record<string, EdgeLayout>;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface PuzzleProject {
  projectName: string;
  graph: PuzzleGraph;
  layout: GraphLayout;
  documents: Record<string, string>;
  writable: boolean;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

export function parseGraph(value: unknown): PuzzleGraph {
  const source = requireObject(value, "graph.yaml");
  if (source.version !== 1) {
    throw new Error("graph.yaml version must be 1.");
  }
  if (!Array.isArray(source.nodes) || !Array.isArray(source.edges)) {
    throw new Error("graph.yaml must contain nodes and edges arrays.");
  }

  const nodes = source.nodes.map((entry, index): PuzzleNodeDefinition => {
    const node = requireObject(entry, `nodes[${index}]`);
    const kind = requireString(node.kind, `nodes[${index}].kind`);
    if (!puzzleKinds.includes(kind as PuzzleKind)) {
      throw new Error(
        `nodes[${index}].kind must be one of ${puzzleKinds.join(", ")}.`,
      );
    }
    if (node.status !== undefined && node.status !== "tbd") {
      throw new Error(`nodes[${index}].status must be tbd when present.`);
    }
    if (node.todo !== undefined && !Array.isArray(node.todo)) {
      throw new Error(`nodes[${index}].todo must be an array when present.`);
    }
    const todo = (node.todo ?? []).map((entry, todoIndex): TodoEffect => {
      const effect = requireObject(
        entry,
        `nodes[${index}].todo[${todoIndex}]`,
      );
      const action = requireString(
        effect.action,
        `nodes[${index}].todo[${todoIndex}].action`,
      );
      if (!["add", "complete", "remove"].includes(action)) {
        throw new Error(
          `nodes[${index}].todo[${todoIndex}].action must be add, complete, or remove.`,
        );
      }
      return {
        id: requireString(
          effect.id,
          `nodes[${index}].todo[${todoIndex}].id`,
        ),
        action: action as TodoAction,
        ...(typeof effect.label === "string" ? { label: effect.label } : {}),
        ...(typeof effect.parentId === "string"
          ? { parentId: effect.parentId }
          : {}),
        ...(typeof effect.order === "number" &&
        Number.isInteger(effect.order) &&
        effect.order >= 0
          ? { order: effect.order }
          : {}),
      };
    });
    return {
      id: requireString(node.id, `nodes[${index}].id`),
      title: requireString(node.title, `nodes[${index}].title`),
      document: requireString(node.document, `nodes[${index}].document`),
      kind: kind as PuzzleKind,
      ...(typeof node.summary === "string" ? { summary: node.summary } : {}),
      ...(node.status === "tbd" ? { status: "tbd" as const } : {}),
      ...(todo.length ? { todo } : {}),
    };
  });

  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  const edges = source.edges.map((entry, index): PuzzleEdgeDefinition => {
    const edge = requireObject(entry, `edges[${index}]`);
    const parsed = {
      id: requireString(edge.id, `edges[${index}].id`),
      from: requireString(edge.from, `edges[${index}].from`),
      to: requireString(edge.to, `edges[${index}].to`),
      ...(typeof edge.label === "string" ? { label: edge.label } : {}),
    };
    if (edgeIds.has(parsed.id)) {
      throw new Error(`Duplicate edge id: ${parsed.id}`);
    }
    edgeIds.add(parsed.id);
    if (!nodeIds.has(parsed.from) || !nodeIds.has(parsed.to)) {
      throw new Error(`Edge ${parsed.id} refers to an unknown node.`);
    }
    return parsed;
  });

  return {
    version: 1,
    title: requireString(source.title, "graph.yaml title"),
    ...(typeof source.description === "string"
      ? { description: source.description }
      : {}),
    nodes,
    edges,
  };
}

export function parseLayout(value: unknown): GraphLayout {
  const source = requireObject(value, "layout.json");
  const rawNodes = requireObject(source.nodes, "layout.json nodes");
  const rawEdges = source.edges
    ? requireObject(source.edges, "layout.json edges")
    : {};
  const nodes: Record<string, NodeLayout> = {};
  const edges: Record<string, EdgeLayout> = {};

  for (const [id, entry] of Object.entries(rawNodes)) {
    const position = requireObject(entry, `layout node ${id}`);
    if (typeof position.x !== "number" || typeof position.y !== "number") {
      throw new Error(`Layout node ${id} must have numeric x and y values.`);
    }
    nodes[id] = { x: position.x, y: position.y };
  }

  for (const [id, entry] of Object.entries(rawEdges)) {
    const route = requireObject(entry, `layout edge ${id}`);
    const type = route.type ?? "bezier";
    if (!["straight", "bezier", "step", "smoothstep"].includes(String(type))) {
      throw new Error(`Layout edge ${id} has an unsupported type.`);
    }
    edges[id] = {
      type: type as EdgeRoute,
      ...(typeof route.curvature === "number"
        ? { curvature: route.curvature }
        : {}),
      ...(typeof route.borderRadius === "number"
        ? { borderRadius: route.borderRadius }
        : {}),
      ...(typeof route.offset === "number" ? { offset: route.offset } : {}),
    };
  }

  let viewport: GraphLayout["viewport"];
  if (source.viewport) {
    const rawViewport = requireObject(source.viewport, "layout.json viewport");
    if (
      typeof rawViewport.x !== "number" ||
      typeof rawViewport.y !== "number" ||
      typeof rawViewport.zoom !== "number"
    ) {
      throw new Error("layout.json viewport must have numeric x, y, and zoom values.");
    }
    viewport = {
      x: rawViewport.x,
      y: rawViewport.y,
      zoom: rawViewport.zoom,
    };
  }

  return { nodes, edges, ...(viewport ? { viewport } : {}) };
}
