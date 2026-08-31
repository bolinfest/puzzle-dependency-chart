import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  SelectionMode,
  applyNodeChanges,
  type Connection,
  type EdgeMouseHandler,
  type NodeChange,
  type NodeMouseHandler,
  type OnMoveEnd,
} from "@xyflow/react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Redo2,
  Route,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  fallbackViewport,
  layoutWithNodePositions,
  makeFlowEdges,
  makeFlowNodes,
  type PuzzleFlowNode,
} from "../lib/flow-model";
import {
  puzzleKinds,
  type EdgeRoute,
  type GraphLayout,
  type PuzzleGraph,
  type PuzzleKind,
  type PuzzleNodeDefinition,
  type PuzzleProject,
} from "../lib/project-types";
import { PuzzleNode } from "./PuzzleNode";

const nodeTypes = { puzzle: PuzzleNode };
const inspectorCollapsedStorageKey = "puzzle-chart:inspector-collapsed";
const routes: Array<{ value: EdgeRoute; label: string }> = [
  { value: "straight", label: "Straight" },
  { value: "bezier", label: "S-curve" },
  { value: "smoothstep", label: "Rounded step" },
  { value: "step", label: "Square step" },
];
const kindLabels: Record<PuzzleKind, string> = {
  constraint: "Rule",
  insight: "Insight",
  move: "Action",
  conversation: "Conversation",
  goal: "Goal",
};

export interface ProjectEdit {
  label: string;
  graph?: PuzzleGraph;
  layout?: GraphLayout;
  initialDocuments?: Record<string, string>;
  selectNodeId?: string;
}

interface GraphPaneProps {
  project: PuzzleProject;
  editable: boolean;
  selectedNodeId?: string;
  onSelectNode: (id: string) => void;
  onProjectEdit: (edit: ProjectEdit) => void;
  onViewportChange: (layout: GraphLayout) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  onUndo: () => void;
  onRedo: () => void;
}

function uniqueId(base: string, existing: Iterable<string>): string {
  const ids = new Set(existing);
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function withoutKeys<T>(
  record: Record<string, T>,
  keys: Set<string>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.has(key)),
  );
}

export function GraphPane({
  project,
  editable,
  selectedNodeId,
  onSelectNode,
  onProjectEdit,
  onViewportChange,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
}: GraphPaneProps) {
  const [nodes, setNodes] = useState<PuzzleFlowNode[]>(() =>
    makeFlowNodes(project).map((node) => ({
      ...node,
      selected: node.id === selectedNodeId,
    })),
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [inspectorCollapsed, setInspectorCollapsed] = useState(
    () => window.sessionStorage.getItem(inspectorCollapsedStorageKey) === "true",
  );

  const setInspectorCollapsedState = (collapsed: boolean) => {
    setInspectorCollapsed(collapsed);
    window.sessionStorage.setItem(inspectorCollapsedStorageKey, String(collapsed));
  };

  useEffect(() => {
    setNodes((current) => {
      const selectedIds = new Set(
        current.filter((node) => node.selected).map((node) => node.id),
      );
      return makeFlowNodes(project).map((node) => ({
        ...node,
        selected:
          selectedIds.has(node.id) ||
          (selectedIds.size === 0 && node.id === selectedNodeId),
      }));
    });
  }, [project.graph, project.layout.nodes]);
  useEffect(() => {
    if (
      selectedEdgeId &&
      !project.graph.edges.some((edge) => edge.id === selectedEdgeId)
    ) {
      setSelectedEdgeId(undefined);
    }
  }, [project.graph.edges, selectedEdgeId]);

  const edges = useMemo(
    () =>
      makeFlowEdges(project).map((edge) => ({
        ...edge,
        selected: edge.id === selectedEdgeId,
      })),
    [project, selectedEdgeId],
  );
  const selectedNode = project.graph.nodes.find(
    (node) => node.id === selectedNodeId,
  );
  const selectedEdge = project.graph.edges.find(
    (edge) => edge.id === selectedEdgeId,
  );

  const updateNode = (
    nodeId: string,
    patch: Partial<PuzzleNodeDefinition>,
    label: string,
  ) => {
    const original = project.graph.nodes.find((node) => node.id === nodeId);
    if (!original) return;
    const updated = { ...original, ...patch };
    const initialDocuments =
      updated.document !== original.document
        ? {
            [updated.document]:
              project.documents[original.document] ??
              `# ${updated.title}\n\nDescribe this puzzle, its clues, and its solution.\n`,
          }
        : undefined;
    if (
      Object.entries(patch).every(
        ([key, value]) =>
          JSON.stringify(original[key as keyof PuzzleNodeDefinition]) ===
          JSON.stringify(value),
      )
    ) {
      return;
    }
    onProjectEdit({
      label,
      graph: {
        ...project.graph,
        nodes: project.graph.nodes.map((node) =>
          node.id === nodeId ? updated : node,
        ),
      },
      initialDocuments,
    });
  };

  const addNode = () => {
    const id = uniqueId(
      "untitled-node",
      project.graph.nodes.map((node) => node.id),
    );
    const document = `docs/${id}.md`;
    const definition: PuzzleNodeDefinition = {
      id,
      title: "Untitled node",
      document,
      kind: "move",
      summary: "Describe what this puzzle accomplishes.",
      status: "tbd",
    };
    const positions = Object.values(project.layout.nodes);
    const x = positions.length
      ? Math.round(
          positions.reduce((total, position) => total + position.x, 0) /
            positions.length,
        )
      : 180;
    const y = positions.length
      ? Math.max(...positions.map((position) => position.y)) + 170
      : 40;
    const layout = {
      ...project.layout,
      nodes: { ...project.layout.nodes, [id]: { x, y } },
    };
    const markdown =
      "# Untitled node\n\nDescribe this event, its clues, and its consequences.\n";

    onProjectEdit({
      label: "Add node",
      graph: { ...project.graph, nodes: [...project.graph.nodes, definition] },
      layout,
      initialDocuments: { [document]: markdown },
      selectNodeId: id,
    });
    setSelectedEdgeId(undefined);
    onSelectNode(id);
  };

  const deleteNode = (nodeId: string) => {
    const removedEdgeIds = new Set(
      project.graph.edges
        .filter((edge) => edge.from === nodeId || edge.to === nodeId)
        .map((edge) => edge.id),
    );
    const graph = {
      ...project.graph,
      nodes: project.graph.nodes.filter((node) => node.id !== nodeId),
      edges: project.graph.edges.filter(
        (edge) => !removedEdgeIds.has(edge.id),
      ),
    };
    const layout = {
      ...project.layout,
      nodes: withoutKeys(project.layout.nodes, new Set([nodeId])),
      edges: withoutKeys(project.layout.edges, removedEdgeIds),
    };
    onProjectEdit({
      label: "Delete node",
      graph,
      layout,
      selectNodeId: graph.nodes[0]?.id,
    });
    setSelectedEdgeId(undefined);
    if (graph.nodes[0]) onSelectNode(graph.nodes[0].id);
  };

  const addEdge = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const id = uniqueId(
      `${connection.source}-to-${connection.target}`,
      project.graph.edges.map((edge) => edge.id),
    );
    onProjectEdit({
      label: "Add dependency",
      graph: {
        ...project.graph,
        edges: [
          ...project.graph.edges,
          { id, from: connection.source, to: connection.target },
        ],
      },
      layout: {
        ...project.layout,
        edges: {
          ...project.layout.edges,
          [id]: { type: "bezier", curvature: 0.32 },
        },
      },
    });
    setSelectedEdgeId(id);
  };

  const updateEdgeLabel = (label: string) => {
    if (!selectedEdgeId) return;
    const edge = project.graph.edges.find((item) => item.id === selectedEdgeId);
    if ((edge?.label ?? "") === label) return;
    onProjectEdit({
      label: "Edit dependency label",
      graph: {
        ...project.graph,
        edges: project.graph.edges.map((item) =>
          item.id === selectedEdgeId
            ? { ...item, label: label || undefined }
            : item,
        ),
      },
    });
  };

  const deleteEdge = () => {
    if (!selectedEdgeId) return;
    onProjectEdit({
      label: "Delete dependency",
      graph: {
        ...project.graph,
        edges: project.graph.edges.filter(
          (edge) => edge.id !== selectedEdgeId,
        ),
      },
      layout: {
        ...project.layout,
        edges: withoutKeys(project.layout.edges, new Set([selectedEdgeId])),
      },
    });
    setSelectedEdgeId(undefined);
  };

  const setEdgeRoute = (type: EdgeRoute) => {
    if (!selectedEdgeId) return;
    if ((project.layout.edges[selectedEdgeId]?.type ?? "bezier") === type) return;
    onProjectEdit({
      label: "Change edge route",
      layout: {
        ...project.layout,
        edges: {
          ...project.layout.edges,
          [selectedEdgeId]: {
            ...project.layout.edges[selectedEdgeId],
            type,
            ...(type === "bezier" ? { curvature: 0.32 } : {}),
            ...(type === "smoothstep" ? { borderRadius: 18, offset: 24 } : {}),
          },
        },
      },
    });
  };

  const selectedRoute = selectedEdgeId
    ? (project.layout.edges[selectedEdgeId]?.type ?? "bezier")
    : undefined;

  return (
    <section className="graph-pane" aria-label="Puzzle dependency chart">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes: NodeChange<PuzzleFlowNode>[]) =>
          setNodes((current) => applyNodeChanges(changes, current))
        }
        onNodeClick={((_, node) => {
          setSelectedEdgeId(undefined);
          onSelectNode(node.id);
        }) satisfies NodeMouseHandler<PuzzleFlowNode>}
        onEdgeClick={((_, edge) => {
          if (editable) setSelectedEdgeId(edge.id);
        }) satisfies EdgeMouseHandler}
        onPaneClick={() => setSelectedEdgeId(undefined)}
        onConnect={addEdge}
        isValidConnection={(connection) =>
          Boolean(
            connection.source &&
              connection.target &&
              connection.source !== connection.target &&
              !project.graph.edges.some(
                (edge) =>
                  edge.from === connection.source &&
                  edge.to === connection.target,
              ),
          )
        }
        onNodeDragStop={(_, node, draggedNodes) => {
          if (!editable) return;
          const movedNodes = draggedNodes.length ? draggedNodes : [node];
          const layout = layoutWithNodePositions(project.layout, movedNodes);
          if (!layout) return;
          onProjectEdit({
            label: movedNodes.length > 1 ? `Move ${movedNodes.length} nodes` : "Move node",
            layout,
          });
        }}
        onMoveEnd={((_, viewport) => {
          if (editable) onViewportChange({ ...project.layout, viewport });
        }) satisfies OnMoveEnd}
        defaultViewport={project.layout.viewport ?? fallbackViewport}
        nodesDraggable={editable}
        nodesConnectable={editable}
        elementsSelectable
        panOnScroll
        panOnDrag={editable ? [1, 2] : true}
        selectionOnDrag={editable}
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={null}
        minZoom={0.25}
        maxZoom={1.75}
        colorMode="light"
        connectionLineStyle={{ stroke: "#276b70", strokeWidth: 2 }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.1}
          color="#b8c2ba"
        />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeStrokeWidth={3}
          nodeColor={(node) => {
            const definition = (node as PuzzleFlowNode).data.definition;
            if (definition.status === "tbd") return "#7a5aa6";
            return {
              constraint: "#a35a3a",
              insight: "#b78a2e",
              move: "#527a68",
              conversation: "#52719b",
              goal: "#276b70",
            }[definition.kind];
          }}
        />
      </ReactFlow>

      {editable ? (
        <div className="graph-edit-toolbar">
          <button type="button" onClick={addNode}>
            <Plus size={15} aria-hidden="true" />
            Add node
          </button>
          <div className="history-controls" aria-label="Graph history">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title={canUndo ? `Undo ${undoLabel ?? "change"} (⌘Z)` : "Nothing to undo"}
              aria-label={canUndo ? `Undo ${undoLabel ?? "change"}` : "Nothing to undo"}
            >
              <Undo2 size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title={canRedo ? `Redo ${redoLabel ?? "change"} (⇧⌘Z)` : "Nothing to redo"}
              aria-label={canRedo ? `Redo ${redoLabel ?? "change"}` : "Nothing to redo"}
            >
              <Redo2 size={15} aria-hidden="true" />
            </button>
          </div>
          <span>Drag canvas to select · Space-drag to pan · Drag a handle to connect</span>
        </div>
      ) : null}

      {editable && selectedEdge && selectedRoute ? (
        <EdgeInspector
          edge={selectedEdge}
          sourceTitle={
            project.graph.nodes.find((node) => node.id === selectedEdge.from)
              ?.title ?? selectedEdge.from
          }
          targetTitle={
            project.graph.nodes.find((node) => node.id === selectedEdge.to)
              ?.title ?? selectedEdge.to
          }
          route={selectedRoute}
          onRouteChange={setEdgeRoute}
          onLabelChange={updateEdgeLabel}
          onDelete={deleteEdge}
          collapsed={inspectorCollapsed}
          onToggle={() => setInspectorCollapsedState(!inspectorCollapsed)}
        />
      ) : selectedNode ? (
        <NodeInspector
          node={selectedNode}
          editable={editable}
          onUpdate={(patch, label) =>
            updateNode(selectedNode.id, patch, label)
          }
          onDelete={() => deleteNode(selectedNode.id)}
          collapsed={inspectorCollapsed}
          onToggle={() => setInspectorCollapsedState(!inspectorCollapsed)}
        />
      ) : null}
    </section>
  );
}

interface NodeInspectorProps {
  node: PuzzleNodeDefinition;
  editable: boolean;
  onUpdate: (patch: Partial<PuzzleNodeDefinition>, label: string) => void;
  onDelete: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

function NodeInspector({
  node,
  editable,
  onUpdate,
  onDelete,
  collapsed,
  onToggle,
}: NodeInspectorProps) {
  return (
    <aside
      className={`graph-inspector node-inspector${collapsed ? " is-collapsed" : ""}`}
      aria-label="Node properties"
    >
      <button
        type="button"
        className="inspector-toggle-bar"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Show" : "Hide"} node properties`}
        title={`${collapsed ? "Show" : "Hide"} node properties`}
      >
        <span>Node properties</span>
        {collapsed ? (
          <ChevronDown size={16} aria-hidden="true" />
        ) : (
          <ChevronUp size={16} aria-hidden="true" />
        )}
      </button>
      {!collapsed ? <div className="inspector-content">
        <header>
          <div>
            <span className="eyebrow">Selected node</span>
            <code>{node.id}</code>
          </div>
          {editable ? (
            <div className="inspector-header-actions">
              <ConfirmDeleteButton
                triggerLabel={`Delete ${node.title}`}
                title={`Delete “${node.title}”?`}
                message="The node and its dependencies will be removed from the chart. Its Markdown file will be kept."
                confirmLabel="Delete node"
                onConfirm={onDelete}
              />
            </div>
          ) : null}
        </header>
        <label>
          <span>Title</span>
          <input
            key={`${node.id}:title:${node.title}`}
            defaultValue={node.title}
            readOnly={!editable}
            onBlur={(event) => {
              if (!editable) return;
              const title = event.currentTarget.value.trim();
              if (title) onUpdate({ title }, "Rename node");
              else event.currentTarget.value = node.title;
            }}
          />
        </label>
        <div className="inspector-row">
          <label>
            <span>Type</span>
            <select
              value={node.kind}
              disabled={!editable}
              onChange={(event) => {
                if (!editable) return;
                onUpdate(
                  { kind: event.target.value as PuzzleKind },
                  "Change node type",
                );
              }}
            >
              {puzzleKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kindLabels[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className="status-toggle">
            <input
              type="checkbox"
              checked={node.status === "tbd"}
              disabled={!editable}
              onChange={(event) => {
                if (!editable) return;
                onUpdate(
                  { status: event.target.checked ? "tbd" : undefined },
                  event.target.checked ? "Mark node TBD" : "Mark node designed",
                );
              }}
            />
            <span>Design is TBD</span>
          </label>
        </div>
        <label>
          <span>Markdown file</span>
          <input
            key={`${node.id}:document:${node.document}`}
            defaultValue={node.document}
            readOnly={!editable}
            spellCheck={false}
            onBlur={(event) => {
              if (!editable) return;
              const document = event.currentTarget.value.trim();
              if (document.endsWith(".md")) {
                onUpdate({ document }, "Change document path");
              }
              else event.currentTarget.value = node.document;
            }}
          />
        </label>
        <label>
          <span>Summary</span>
          <textarea
            key={`${node.id}:summary:${node.summary ?? ""}`}
            defaultValue={node.summary}
            readOnly={!editable}
            rows={2}
            onBlur={(event) => {
              if (!editable) return;
              onUpdate(
                { summary: event.currentTarget.value.trim() || undefined },
                "Edit node summary",
              );
            }}
          />
        </label>
        <p className="todo-markdown-hint">
          {editable
            ? "TODO effects live in a source-only comment and are edited beside the node’s puzzle notes."
            : "TODO effects are stored with the puzzle notes and shown above their rendered Markdown."}
        </p>
      </div> : null}
    </aside>
  );
}

interface EdgeInspectorProps {
  edge: PuzzleGraph["edges"][number];
  sourceTitle: string;
  targetTitle: string;
  route: EdgeRoute;
  onRouteChange: (route: EdgeRoute) => void;
  onLabelChange: (label: string) => void;
  onDelete: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

function EdgeInspector({
  edge,
  sourceTitle,
  targetTitle,
  route,
  onRouteChange,
  onLabelChange,
  onDelete,
  collapsed,
  onToggle,
}: EdgeInspectorProps) {
  return (
    <aside
      className={`graph-inspector edge-inspector${collapsed ? " is-collapsed" : ""}`}
      aria-label="Dependency properties"
    >
      <button
        type="button"
        className="inspector-toggle-bar"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Show" : "Hide"} dependency properties`}
        title={`${collapsed ? "Show" : "Hide"} dependency properties`}
      >
        <span>Dependency properties</span>
        {collapsed ? (
          <ChevronDown size={16} aria-hidden="true" />
        ) : (
          <ChevronUp size={16} aria-hidden="true" />
        )}
      </button>
      {!collapsed ? <div className="inspector-content">
        <header>
          <div>
            <span className="eyebrow">Dependency</span>
            <strong title={`${sourceTitle} → ${targetTitle}`}>
              {sourceTitle} → {targetTitle}
            </strong>
          </div>
          <div className="inspector-header-actions">
            <ConfirmDeleteButton
              triggerLabel="Delete dependency"
              title="Delete this dependency?"
              message={`The connection from “${sourceTitle}” to “${targetTitle}” will be removed.`}
              confirmLabel="Delete dependency"
              onConfirm={onDelete}
            />
          </div>
        </header>
        <div className="inspector-row">
          <label>
            <span>
              <Route size={13} aria-hidden="true" /> Path
            </span>
            <select
              value={route}
              onChange={(event) =>
                onRouteChange(event.target.value as EdgeRoute)
              }
            >
              {routes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Label</span>
            <input
              key={`${edge.id}:label:${edge.label ?? ""}`}
              defaultValue={edge.label}
              placeholder="Optional"
              onBlur={(event) => onLabelChange(event.currentTarget.value.trim())}
            />
          </label>
        </div>
      </div> : null}
    </aside>
  );
}

interface ConfirmDeleteButtonProps {
  triggerLabel: string;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

function ConfirmDeleteButton({
  triggerLabel,
  title,
  message,
  confirmLabel,
  onConfirm,
}: ConfirmDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        type="button"
        className="icon-danger-button"
        onClick={() => setConfirming(true)}
        aria-label={triggerLabel}
        title={triggerLabel}
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
      {confirming ? (
        <div
          className="delete-confirmation"
          role="alertdialog"
          aria-label={title}
        >
          <strong>{title}</strong>
          <p>{message}</p>
          <div>
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="confirm-delete-button"
              onClick={() => {
                setConfirming(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
