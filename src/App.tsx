import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
  Check,
  CloudOff,
  Eye,
  GitBranch,
  LoaderCircle,
  PencilLine,
  TriangleAlert,
} from "lucide-react";
import {
  GraphPane,
  type ProjectEdit,
} from "./components/GraphPane";
import { MarkdownPane } from "./components/MarkdownPane";
import type {
  GraphLayout,
  PuzzleGraph,
  PuzzleProject,
} from "./lib/project-types";
import { hydrateGraphTodoEffects } from "./lib/todo-markdown";

type Mode = "view" | "edit";
type SaveState = "idle" | "saving" | "saved" | "error";

interface HistorySnapshot {
  graph: PuzzleGraph;
  nodes: GraphLayout["nodes"];
  edges: GraphLayout["edges"];
  selectedNodeId?: string;
}

interface HistoryEntry {
  label: string;
  snapshot: HistorySnapshot;
}

interface ProjectHistory {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

const projectUrl = import.meta.env.DEV
  ? "/__pdc/project"
  : `${import.meta.env.BASE_URL}project-data.json`;
const maxHistoryEntries = 100;

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: string };
    return new Error(body.error ?? `Request failed (${response.status})`);
  } catch {
    return new Error(`Request failed (${response.status})`);
  }
}

function captureSnapshot(
  project: PuzzleProject,
  selectedNodeId?: string,
): HistorySnapshot {
  return {
    graph: project.graph,
    nodes: project.layout.nodes,
    edges: project.layout.edges,
    selectedNodeId,
  };
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable='true'], .mdxeditor",
    ),
  );
}

export default function App() {
  const [project, setProject] = useState<PuzzleProject>();
  const [mode, setMode] = useState<Mode>("view");
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string>();
  const [historyVersion, setHistoryVersion] = useState(0);

  const projectRef = useRef<PuzzleProject | undefined>(undefined);
  const modeRef = useRef<Mode>("view");
  const selectedNodeIdRef = useRef<string | undefined>(undefined);
  const historyRef = useRef<ProjectHistory>({ past: [], future: [] });
  const documentSaveTimers = useRef(new Map<string, number>());
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const latestSaveRevision = useRef(0);

  const selectNode = useCallback((nodeId: string) => {
    selectedNodeIdRef.current = nodeId;
    setSelectedNodeId(nodeId);
  }, []);

  const enqueueProjectSave = useCallback(
    (payload: {
      graph?: PuzzleGraph;
      layout?: GraphLayout;
      documents?: Record<string, string>;
    }) => {
      const revision = ++latestSaveRevision.current;
      setSaveState("saving");
      const task = saveQueue.current.then(async () => {
        const response = await fetch("/__pdc/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw await responseError(response);
      });
      saveQueue.current = task.then(
        () => undefined,
        () => undefined,
      );
      void task.then(
        () => {
          if (revision === latestSaveRevision.current) setSaveState("saved");
        },
        () => {
          if (revision === latestSaveRevision.current) setSaveState("error");
        },
      );
    },
    [],
  );

  const applyProjectEdit = useCallback(
    (edit: ProjectEdit) => {
      const current = projectRef.current;
      if (!current?.writable || modeRef.current !== "edit") return;
      const graph = edit.graph ?? current.graph;
      const layout = edit.layout ?? current.layout;
      if (graph === current.graph && layout === current.layout) return;

      historyRef.current.past.push({
        label: edit.label,
        snapshot: captureSnapshot(current, selectedNodeIdRef.current),
      });
      if (historyRef.current.past.length > maxHistoryEntries) {
        historyRef.current.past.shift();
      }
      historyRef.current.future = [];
      setHistoryVersion((version) => version + 1);

      const next: PuzzleProject = {
        ...current,
        graph,
        layout,
        documents: {
          ...current.documents,
          ...(edit.initialDocuments ?? {}),
        },
      };
      projectRef.current = next;
      setProject(next);
      if ("selectNodeId" in edit && edit.selectNodeId) {
        selectNode(edit.selectNodeId);
      }
      enqueueProjectSave({
        ...(edit.graph ? { graph } : {}),
        ...(edit.layout ? { layout } : {}),
        ...(edit.initialDocuments
          ? { documents: edit.initialDocuments }
          : {}),
      });
    },
    [enqueueProjectSave, selectNode],
  );

  const restoreSnapshot = useCallback(
    (snapshot: HistorySnapshot) => {
      const current = projectRef.current;
      if (!current) return;
      const layout: GraphLayout = {
        ...current.layout,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
      };
      const graph = hydrateGraphTodoEffects(snapshot.graph, current.documents);
      const next = { ...current, graph, layout };
      projectRef.current = next;
      setProject(next);
      const fallbackNodeId = graph.nodes[0]?.id;
      const nodeId =
        snapshot.selectedNodeId &&
        graph.nodes.some((node) => node.id === snapshot.selectedNodeId)
          ? snapshot.selectedNodeId
          : fallbackNodeId;
      if (nodeId) selectNode(nodeId);
      enqueueProjectSave({ graph, layout });
    },
    [enqueueProjectSave, selectNode],
  );

  const undo = useCallback(() => {
    const current = projectRef.current;
    const entry = historyRef.current.past.pop();
    if (!current || !entry) return;
    historyRef.current.future.push({
      label: entry.label,
      snapshot: captureSnapshot(current, selectedNodeIdRef.current),
    });
    setHistoryVersion((version) => version + 1);
    restoreSnapshot(entry.snapshot);
  }, [restoreSnapshot]);

  const redo = useCallback(() => {
    const current = projectRef.current;
    const entry = historyRef.current.future.pop();
    if (!current || !entry) return;
    historyRef.current.past.push({
      label: entry.label,
      snapshot: captureSnapshot(current, selectedNodeIdRef.current),
    });
    setHistoryVersion((version) => version + 1);
    restoreSnapshot(entry.snapshot);
  }, [restoreSnapshot]);

  const updateViewport = useCallback(
    (layout: GraphLayout) => {
      const current = projectRef.current;
      if (!current?.writable || modeRef.current !== "edit") return;
      const next = { ...current, layout };
      projectRef.current = next;
      setProject(next);
      enqueueProjectSave({ layout });
    },
    [enqueueProjectSave],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(projectUrl);
        if (!response.ok) throw await responseError(response);
        const loaded = (await response.json()) as PuzzleProject;
        if (cancelled) return;
        projectRef.current = loaded;
        setProject(loaded);
        const initialNodeId = loaded.graph.nodes[0]?.id;
        if (initialNodeId) selectNode(initialNodeId);
        const initialMode = loaded.writable ? "edit" : "view";
        modeRef.current = initialMode;
        setMode(initialMode);
        document.title = `${loaded.graph.title} · Puzzle Chart`;
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Unable to load project.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const timer of documentSaveTimers.current.values()) {
        window.clearTimeout(timer);
      }
    };
  }, [selectNode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        modeRef.current !== "edit" ||
        isTextEditingTarget(event.target) ||
        !(event.metaKey || event.ctrlKey)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y" && !event.metaKey) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redo, undo]);

  if (error) {
    return (
      <main className="load-state error-state">
        <TriangleAlert size={34} aria-hidden="true" />
        <h1>Couldn’t open this puzzle chart</h1>
        <p>{error}</p>
        <p className="load-hint">
          Check that the input folder contains valid graph.yaml and layout.json
          files.
        </p>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="load-state">
        <LoaderCircle className="spinner" size={30} aria-hidden="true" />
        <p>Opening puzzle chart…</p>
      </main>
    );
  }

  const editable = mode === "edit" && project.writable;
  const selectedNode = project.graph.nodes.find(
    (node) => node.id === selectedNodeId,
  );
  const markdown = selectedNode
    ? (project.documents[selectedNode.document] ?? "")
    : "";
  const canUndo = historyVersion >= 0 && historyRef.current.past.length > 0;
  const canRedo = historyVersion >= 0 && historyRef.current.future.length > 0;

  const saveDocument = (nextMarkdown: string) => {
    const current = projectRef.current;
    const currentNode = current?.graph.nodes.find(
      (node) => node.id === selectedNodeIdRef.current,
    );
    if (!current || !editable || !currentNode) return;
    const documentPath = currentNode.document;
    const documents = {
      ...current.documents,
      [documentPath]: nextMarkdown,
    };
    const graph = hydrateGraphTodoEffects(current.graph, documents);
    const next = { ...current, graph, documents };
    projectRef.current = next;
    setProject(next);
    setSaveState("saving");
    const existingTimer = documentSaveTimers.current.get(documentPath);
    if (existingTimer) window.clearTimeout(existingTimer);
    documentSaveTimers.current.set(
      documentPath,
      window.setTimeout(() => {
        documentSaveTimers.current.delete(documentPath);
        void (async () => {
          try {
            const response = await fetch("/__pdc/document", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: documentPath, markdown: nextMarkdown }),
            });
            if (!response.ok) throw await responseError(response);
            setSaveState("saved");
          } catch {
            setSaveState("error");
          }
        })();
      }, 650),
    );
  };

  const setApplicationMode = (nextMode: Mode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <GitBranch size={19} />
          </div>
          <div>
            <div className="project-label">{project.projectName}</div>
            <h1>{project.graph.title}</h1>
          </div>
        </div>

        <div className="header-actions">
          {project.writable ? (
            <div className="mode-switch" aria-label="Application mode">
              <button
                type="button"
                className={mode === "view" ? "is-active" : ""}
                onClick={() => setApplicationMode("view")}
                aria-pressed={mode === "view"}
              >
                <Eye size={15} aria-hidden="true" />
                View
              </button>
              <button
                type="button"
                className={mode === "edit" ? "is-active" : ""}
                onClick={() => setApplicationMode("edit")}
                aria-pressed={mode === "edit"}
              >
                <PencilLine size={15} aria-hidden="true" />
                Edit
              </button>
            </div>
          ) : (
            <div className="view-only-badge">
              <CloudOff size={14} aria-hidden="true" />
              Published view
            </div>
          )}
          {editable ? <SaveIndicator state={saveState} /> : null}
        </div>
      </header>

      <div className="workspace">
        <Group orientation="horizontal">
          <Panel defaultSize={57} minSize={34}>
            <div className="panel-frame graph-frame">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Dependency map</span>
                  <p>{project.graph.description}</p>
                </div>
                <div className="node-count">
                  {project.graph.nodes.length} nodes
                </div>
              </div>
              <GraphPane
                project={project}
                editable={editable}
                selectedNodeId={selectedNodeId}
                onSelectNode={selectNode}
                onProjectEdit={applyProjectEdit}
                onViewportChange={updateViewport}
                canUndo={canUndo}
                canRedo={canRedo}
                undoLabel={historyRef.current.past.at(-1)?.label}
                redoLabel={historyRef.current.future.at(-1)?.label}
                onUndo={undo}
                onRedo={redo}
              />
            </div>
          </Panel>
          <Separator className="resize-handle" aria-label="Resize chart and notes">
            <span />
          </Separator>
          <Panel defaultSize={43} minSize={28}>
            <div className="panel-frame document-frame">
              <MarkdownPane
                node={selectedNode}
                markdown={markdown}
                editable={editable}
                onChange={saveDocument}
              />
            </div>
          </Panel>
        </Group>
      </div>
    </main>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const content = {
    saving: { icon: LoaderCircle, label: "Saving…", className: "is-saving" },
    saved: { icon: Check, label: "Saved", className: "is-saved" },
    error: {
      icon: TriangleAlert,
      label: "Save failed",
      className: "is-error",
    },
  }[state];
  const Icon = content.icon;
  return (
    <div className={`save-indicator ${content.className}`} role="status">
      <Icon size={14} className={state === "saving" ? "spinner" : ""} />
      {content.label}
    </div>
  );
}
