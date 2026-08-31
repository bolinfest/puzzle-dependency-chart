import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
  Check,
  CloudOff,
  Database,
  Download,
  Eye,
  GitBranch,
  LoaderCircle,
  PencilLine,
  RotateCcw,
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
import { localDraftKey } from "./lib/local-draft";
import {
  createInitialProjectStore,
  IndexedDbProjectStore,
  type ProjectStore,
} from "./lib/project-store";
import {
  createProjectZip,
  safeProjectFilename,
} from "./lib/project-serialization";
import { hydrateGraphTodoEffects } from "./lib/todo-markdown";

type Mode = "view" | "edit" | "draft";
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
const initialProjectStore = createInitialProjectStore(
  projectUrl,
  import.meta.env.DEV,
);
const maxHistoryEntries = 100;

function isEditingMode(mode: Mode): boolean {
  return mode === "edit" || mode === "draft";
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
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string>();
  const [confirmingDraftReset, setConfirmingDraftReset] = useState(false);

  const projectRef = useRef<PuzzleProject | undefined>(undefined);
  const publishedProjectRef = useRef<PuzzleProject | undefined>(undefined);
  const modeRef = useRef<Mode>("view");
  const storeRef = useRef<ProjectStore>(initialProjectStore);
  const publishedStoreRef = useRef<ProjectStore>(initialProjectStore);
  const draftKeyRef = useRef<string | undefined>(undefined);
  const selectedNodeIdRef = useRef<string | undefined>(undefined);
  const historyRef = useRef<ProjectHistory>({ past: [], future: [] });
  const documentSaveTimers = useRef(new Map<string, number>());
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const latestSaveRevision = useRef(0);

  const selectNode = useCallback((nodeId: string) => {
    selectedNodeIdRef.current = nodeId;
    setSelectedNodeId(nodeId);
  }, []);

  const resetHistory = useCallback(() => {
    historyRef.current = { past: [], future: [] };
    setHistoryVersion((version) => version + 1);
  }, []);

  const clearDocumentSaveTimers = useCallback(() => {
    for (const timer of documentSaveTimers.current.values()) {
      window.clearTimeout(timer);
    }
    documentSaveTimers.current.clear();
  }, []);

  const enqueueProjectSave = useCallback(
    (payload: {
      graph?: PuzzleGraph;
      layout?: GraphLayout;
      documents?: Record<string, string>;
    }) => {
      const store = storeRef.current;
      const snapshot = projectRef.current;
      if (!store.writable || !snapshot) return;
      const revision = ++latestSaveRevision.current;
      setSaveState("saving");
      const task = saveQueue.current.then(() => store.save(snapshot, payload));
      saveQueue.current = task.then(
        () => undefined,
        () => undefined,
      );
      void task.then(
        () => {
          if (store.kind === "local-draft") {
            setDraftAvailable(true);
            setDraftError(undefined);
          }
          if (revision === latestSaveRevision.current) setSaveState("saved");
        },
        (caught: unknown) => {
          if (store.kind === "local-draft") {
            setDraftError(
              caught instanceof Error
                ? caught.message
                : "Unable to save the local draft.",
            );
          }
          if (revision === latestSaveRevision.current) setSaveState("error");
        },
      );
    },
    [],
  );

  const applyProjectEdit = useCallback(
    (edit: ProjectEdit) => {
      const current = projectRef.current;
      if (!current?.writable || !isEditingMode(modeRef.current)) return;
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
      if (!current?.writable || !isEditingMode(modeRef.current)) return;
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
        const { project: loaded } = await initialProjectStore.load();
        if (cancelled) return;
        publishedStoreRef.current = initialProjectStore;
        storeRef.current = initialProjectStore;
        publishedProjectRef.current = loaded;
        projectRef.current = loaded;
        setProject(loaded);
        const initialNodeId = loaded.graph.nodes[0]?.id;
        if (initialNodeId) selectNode(initialNodeId);
        const initialMode = loaded.writable ? "edit" : "view";
        modeRef.current = initialMode;
        setMode(initialMode);
        document.title = `${loaded.graph.title} · Puzzle Chart`;
        if (!loaded.writable) {
          const key = localDraftKey(loaded, window.location.pathname);
          draftKeyRef.current = key;
          try {
            const draftStore = new IndexedDbProjectStore(key, loaded);
            const draft = await draftStore.load();
            if (!cancelled) setDraftAvailable(draft.persisted);
          } catch (caught) {
            if (!cancelled) {
              setDraftError(
                caught instanceof Error
                  ? caught.message
                  : "Unable to read browser draft storage.",
              );
            }
          }
        }
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
      clearDocumentSaveTimers();
    };
  }, [clearDocumentSaveTimers, selectNode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !isEditingMode(modeRef.current) ||
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

  const sourceWritable = Boolean(publishedProjectRef.current?.writable);
  const editable = isEditingMode(mode) && project.writable;
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
        enqueueProjectSave({ documents: { [documentPath]: nextMarkdown } });
      }, 650),
    );
  };

  const setApplicationMode = (nextMode: Mode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  };

  const selectNodeInProject = (
    nextProject: PuzzleProject,
    preferredNodeId?: string,
  ) => {
    const nextNodeId = nextProject.graph.nodes.some(
      (node) => node.id === preferredNodeId,
    )
      ? preferredNodeId
      : nextProject.graph.nodes[0]?.id;
    if (nextNodeId) selectNode(nextNodeId);
  };

  const enterLocalDraft = async () => {
    const baseline = publishedProjectRef.current;
    const key = draftKeyRef.current;
    if (!baseline || baseline.writable || !key) return;
    setDraftLoading(true);
    setDraftError(undefined);
    try {
      const draftStore = new IndexedDbProjectStore(key, baseline);
      const loaded = await draftStore.load();
      const draft = loaded.project;
      storeRef.current = draftStore;
      projectRef.current = draft;
      modeRef.current = "draft";
      setProject(draft);
      setMode("draft");
      setDraftAvailable(loaded.persisted);
      setSaveState(loaded.persisted ? "saved" : "idle");
      resetHistory();
      selectNodeInProject(draft, selectedNodeIdRef.current);
    } catch (caught) {
      setDraftError(
        caught instanceof Error
          ? caught.message
          : "Unable to open the local draft.",
      );
    } finally {
      setDraftLoading(false);
    }
  };

  const showPublishedProject = async () => {
    const baseline = publishedProjectRef.current;
    const current = projectRef.current;
    const draftStore = storeRef.current;
    if (
      !baseline ||
      baseline.writable ||
      !current ||
      draftStore.kind !== "local-draft"
    ) {
      return;
    }
    setDraftLoading(true);
    setDraftError(undefined);
    clearDocumentSaveTimers();
    try {
      await saveQueue.current;
      await draftStore.save(current, {});
      setDraftAvailable(true);
      storeRef.current = publishedStoreRef.current;
      projectRef.current = baseline;
      modeRef.current = "view";
      setProject(baseline);
      setMode("view");
      setSaveState("idle");
      resetHistory();
      selectNodeInProject(baseline, selectedNodeIdRef.current);
    } catch (caught) {
      setDraftError(
        caught instanceof Error
          ? caught.message
          : "Unable to save the local draft.",
      );
      setSaveState("error");
    } finally {
      setDraftLoading(false);
    }
  };

  const resetLocalDraft = async () => {
    const baseline = publishedProjectRef.current;
    const draftStore = storeRef.current;
    if (
      !baseline ||
      baseline.writable ||
      draftStore.kind !== "local-draft" ||
      !draftStore.reset
    ) {
      return;
    }
    setDraftLoading(true);
    setDraftError(undefined);
    clearDocumentSaveTimers();
    try {
      await saveQueue.current;
      await draftStore.reset();
      const { project: draft } = await draftStore.load();
      projectRef.current = draft;
      modeRef.current = "draft";
      setProject(draft);
      setMode("draft");
      setDraftAvailable(false);
      setSaveState("idle");
      setConfirmingDraftReset(false);
      resetHistory();
      selectNodeInProject(draft, selectedNodeIdRef.current);
    } catch (caught) {
      setDraftError(
        caught instanceof Error
          ? caught.message
          : "Unable to reset the local draft.",
      );
    } finally {
      setDraftLoading(false);
    }
  };

  const exportLocalDraft = () => {
    const current = projectRef.current;
    if (!current || modeRef.current !== "draft") return;
    const archive = createProjectZip(current);
    const contents = archive.buffer.slice(
      archive.byteOffset,
      archive.byteOffset + archive.byteLength,
    ) as ArrayBuffer;
    const url = URL.createObjectURL(
      new Blob([contents], { type: "application/zip" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeProjectFilename(current.projectName)}-draft.zip`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
          {sourceWritable ? (
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
            <div className="mode-switch" aria-label="Application mode">
              <button
                type="button"
                className={mode === "view" ? "is-active" : ""}
                onClick={() => {
                  if (mode !== "view") void showPublishedProject();
                }}
                aria-pressed={mode === "view"}
                disabled={draftLoading}
              >
                <CloudOff size={15} aria-hidden="true" />
                Published
              </button>
              <button
                type="button"
                className={mode === "draft" ? "is-active" : ""}
                onClick={() => {
                  if (mode !== "draft") void enterLocalDraft();
                }}
                aria-pressed={mode === "draft"}
                disabled={draftLoading}
                title={
                  draftAvailable
                    ? "Resume the draft saved in this browser"
                    : "Start a draft saved only in this browser"
                }
              >
                <Database size={15} aria-hidden="true" />
                Local draft
                {draftAvailable && mode !== "draft" ? (
                  <span className="draft-available-dot" aria-label="saved draft available" />
                ) : null}
              </button>
            </div>
          )}
          {mode === "draft" ? (
            <div className="draft-actions">
              <button
                type="button"
                onClick={exportLocalDraft}
                title="Download graph.yaml, layout.json, and Markdown as a ZIP"
              >
                <Download size={14} aria-hidden="true" />
                Export
              </button>
              <div className="draft-reset-control">
                <button
                  type="button"
                  onClick={() => setConfirmingDraftReset(true)}
                  disabled={draftLoading}
                  title="Discard this browser's draft and restore the published chart"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Reset
                </button>
                {confirmingDraftReset ? (
                  <div
                    className="draft-reset-confirmation"
                    role="alertdialog"
                    aria-label="Reset local draft?"
                  >
                    <strong>Reset local draft?</strong>
                    <p>
                      This permanently deletes this browser&apos;s draft. The
                      published chart and repository files are unchanged.
                    </p>
                    <div>
                      <button
                        type="button"
                        onClick={() => setConfirmingDraftReset(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="confirm-reset-button"
                        onClick={() => void resetLocalDraft()}
                      >
                        Reset draft
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {editable ? (
            <SaveIndicator state={saveState} local={mode === "draft"} />
          ) : null}
        </div>
      </header>

      {draftError ? (
        <div className="draft-error-banner" role="alert">
          <TriangleAlert size={14} aria-hidden="true" />
          {draftError}
        </div>
      ) : null}

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

function SaveIndicator({
  state,
  local = false,
}: {
  state: SaveState;
  local?: boolean;
}) {
  if (state === "idle") return null;
  const content = {
    saving: {
      icon: LoaderCircle,
      label: local ? "Saving locally…" : "Saving…",
      className: "is-saving",
    },
    saved: {
      icon: Check,
      label: local ? "Saved in browser" : "Saved",
      className: "is-saved",
    },
    error: {
      icon: TriangleAlert,
      label: local ? "Local save failed" : "Save failed",
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
