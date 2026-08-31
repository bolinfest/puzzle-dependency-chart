# Puzzle Dependency Chart — architectural invariants

This repository is a TypeScript/React prototype for authoring and publishing point-and-click adventure puzzle dependency charts.

## Documentation authorship

- `README.md` is reserved for the project owner's introduction and commentary. Do not add or rewrite its prose unless the project owner explicitly asks for that specific edit.
- Codex-authored usage, format, and development documentation belongs in `docs/technical-guide.md`, which must retain its visible authorship note.

## Source of truth

- A chart project is a folder. Its required root files are `graph.yaml` and `layout.json`.
- `graph.yaml` owns semantic content: project metadata, puzzle nodes, document paths, and dependency edges.
- `layout.json` owns presentation state only: node coordinates, per-edge routing, and the saved viewport. Do not duplicate semantic graph data in it.
- Puzzle documents are Markdown (`.md`) files referenced by nodes. They may live anywhere inside the project folder; `docs/` is only a convention.
- Project paths are relative and must resolve inside the project folder. Preserve this containment check in every file-reading or file-writing path.
- These source files are intentionally human-readable and suitable for source control. Do not replace them with browser-only state or an opaque database.

## Runtime modes

- Local development is an authoring environment. Vite provides TypeScript compilation and hot-module reloading, while the custom development endpoint reads the selected project folder and writes Markdown/layout changes back to disk.
- Production output is a static site whose **Published** mode loads read-only `project-data.json`. Its distinct **Local draft** mode exposes the editor, autosaves the complete project in IndexedDB, and must never imply that it changed the published site or repository.
- `.github/workflows/pages.yml` publishes the Clockwork Lighthouse example to GitHub Pages from `main`, and `npm run build:pages` must reproduce its artifact locally. Keep the Pages artifact compatible with a repository subpath.
- Local draft mode must export a ZIP containing source-compatible `graph.yaml`, `layout.json`, and Markdown paths. Reset requires confirmation, deletes only the browser draft, and restores the published baseline.
- `npm run dev -- <project-folder>` and `npm run build -- <project-folder>` select the input. Both default to `examples/fox-chicken-grain` when omitted.
- Markdown autosaves after a short debounce. Semantic graph fields commit on blur or discrete control actions. Node positions, edge routes, and viewport changes save to `layout.json`.
- Graph/layout writes must remain serialized in user-action order. Undo performed while an earlier save is pending must be the last state written to disk.
- Structural graph changes in the UI rewrite `graph.yaml` through the YAML serializer. Keep the result readable and stable, but do not rely on hand-authored YAML comments surviving a UI edit.

## Persistence boundary

- React UI components must not depend directly on HTTP endpoints, IndexedDB, Node filesystem APIs, Tauri APIs, or collaboration services. Loading and saving go through the `ProjectStore` interface in `src/lib/project-store.ts`.
- A store receives both the complete current project snapshot and the mutation that caused the save. Snapshot-oriented stores such as IndexedDB may persist the former; patch-oriented or collaborative stores may transmit the latter.
- Current stores are the writable development HTTP store, read-only published-data store, and IndexedDB local-draft store. A future desktop filesystem store or collaborative/server store should implement this boundary rather than forking editor behavior.
- Filesystem containment, validation, conflict/version handling, authorship, and Git checkpoint policy belong in the relevant store or backend. Collaborative backends should not create a Git commit for every keystroke; prefer explicit or safely batched checkpoints.

## Graph and editor behavior

- React Flow renders and, in authoring mode, edits the graph. MDXEditor renders and edits Markdown.
- The chart is designed for top-to-bottom dependency flow: node input handles are on top and output handles are on the bottom.
- Stored edge route names are `straight`, `bezier`, `step`, and `smoothstep`. React Flow calls Bézier edges `default`; keep that translation at the UI boundary rather than leaking it into `layout.json`.
- Clicking a puzzle node selects the document shown in the right pane. View mode still supports node selection, panning, and zooming.
- MDXEditor treats its `markdown` prop as initialization input. A document selection must remount it with the newly selected Markdown synchronously; do not stage selection through an effect-backed draft, which causes a one-selection lag.
- Edit mode owns node creation, metadata, deletion, drag-to-connect dependencies, edge labels/routes, document text, node positioning, and viewport. Deleting a node intentionally keeps its Markdown file so destructive cleanup is explicit and recoverable.
- Node and dependency deletion must require confirmation. The node confirmation must state that its Markdown file is retained.
- Node and edge properties share a collapsible graph inspector. The overlay's distinct, full-width title bar is the sole expand/collapse target and must remain visible when the content is collapsed; use vertical disclosure arrows because the content opens below. Keep destructive actions in the content area below so they cannot be confused with that large safe target. Remember its collapsed state in browser session storage; it is an author UI preference and must never be written to `graph.yaml` or `layout.json`. Selecting another graph element must not force a user-collapsed inspector open.
- Built-in node kinds describe what an event is: `constraint`, `insight`, `move`, `conversation`, or `goal`. A state-changing conversation should be a node; downstream required dialogue or puzzles should use dependency edges.
- TODO-list changes are effects on the node that caused them, not standalone nodes. Markdown is their sole source of truth, using a `puzzle-chart:todo-effects` YAML block inside an HTML comment at the very start of the document. The optional YAML `parent` field maps to `TodoEffect.parentId` and nests an item beneath another stable TODO ID, even when that parent was added by an earlier node. Optional non-negative integer `order` values provide stable sibling order; TODO-tree consumers sort siblings by `order` and then stable ID, and authoring defaults should increment order by ten to leave insertion gaps. The comment is directly editable in source mode, excluded from WYSIWYG/rendered prose, and presented in a dedicated panel above that prose. Hydrate `node.todo` for graph display and strip derived TODO data whenever serializing `graph.yaml`.
- Do not restate TODO-list additions, completions, removals, nesting, or ordering in a node's rendered Markdown prose. The `puzzle-chart:todo-effects` comment is the sole source of truth; prose may still describe independent story or gameplay consequences.
- `status: tbd` is independent metadata, not a node kind. It may mark any kind and must remain visually conspicuous without changing the underlying kind.
- User-defined node kinds are a likely future extension. Do not overload TODO or TBD metadata as ersatz custom kinds.
- Graph undo/redo stores at most 100 transaction snapshots. Node-property fields commit one entry on blur; selects and structural edits commit immediately; a single-node or multi-node drag commits every moved position as one entry at drag end. React Flow owns the complete node-selection set; the app-level selected node only chooses the document/inspector and must never overwrite multi-selection. Keep Markdown text history and viewport movement out of graph history, and never intercept graph shortcuts from inputs, selects, textareas, or contenteditable editors.

## Examples and verification

- `examples/` is for self-contained, fictional or public-domain test material. Never copy a user's private game puzzles into it.
- The fox–chicken–grain example exercises nested document paths and multiple edge routes.
- The original Clockwork Lighthouse example exercises a larger branching factor, conversations, TODO lifecycles, convergence, and TBD design status. Keep it original; do not replace it with copied commercial adventure-game content.
- Keep schema/file-loading tests and flow-model tests. Before handing off a change, run `npm run typecheck`, `npm test`, and a production build.
- Generated output belongs in `dist/` and must remain ignored by Git.
