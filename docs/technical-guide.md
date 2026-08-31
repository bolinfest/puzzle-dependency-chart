# Puzzle Dependency Chart technical guide

> **Authorship note:** Except where otherwise stated, this technical guide was written by OpenAI Codex. The project owner's introduction and perspective belong in the [README](../README.md).

A source-control-friendly prototype for designing point-and-click adventure puzzle dependencies. React Flow provides the interactive chart and MDXEditor provides a polished Markdown authoring surface beside it.

The same input folder supports two uses:

- A local authoring app with node dragging, edge routing controls, Markdown editing, autosave, and Vite hot reloading.
- A static, view-only build that can be published without a server or write API.

## Quick start

Requires a current Node.js release (Node 22 or newer is recommended).

```bash
npm install
npm run dev
```

That opens the included fox–chicken–grain example. To use another project folder:

```bash
npm run dev -- /path/to/my-puzzle-chart
```

Editing Markdown writes to its referenced `.md` file after a short debounce. Edit mode can also add, update, and delete puzzle nodes; drag between node handles to create dependencies; edit edge labels and routes; and mark unfinished designs as TBD. Semantic changes write to `graph.yaml`, while coordinates and routing write to `layout.json`. Switch to View in the header to experience the read-only UI without leaving the development server.

Graph edits have a 100-entry undo history. Use the toolbar buttons, `Cmd/Ctrl+Z`, or `Cmd/Ctrl+Shift+Z` (`Ctrl+Y` also redoes on Windows). Node-property text is committed as one undoable change on blur. When focus is inside a text field or MDXEditor, the shortcut remains local to that editor instead.

Deleting a node removes its dependencies and layout entry but deliberately leaves its Markdown file on disk, where source control can recover or clean it up explicitly.

## Build a static viewer

```bash
npm run build -- /path/to/my-puzzle-chart
npm run preview
```

The output in `dist/` contains the chart, documents, and layout as a static site. It has no edit toggle and makes no write requests. Because Vite uses a relative base path, the output can be hosted at a domain root or a nested path.

## Publish the hosted example

The GitHub Pages build publishes the Clockwork Lighthouse example:

```bash
npm run build:pages
```

The repository's `Publish puzzle chart to GitHub Pages` workflow runs that command and deploys `dist/` whenever `main` is pushed, or when the workflow is started manually from GitHub's Actions page. Before its first deployment, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

The hosted build is deliberately view-only. It has no server capable of writing `graph.yaml`, `layout.json`, or Markdown back to the repository. A future browser-local draft mode should be labeled separately, store its project snapshot in IndexedDB, and provide an explicit way to export those changes back to source-controlled files.

## Input format

Every input folder contains `graph.yaml` and `layout.json` at its root. Markdown files may live anywhere beneath that folder; `docs/` is the default convention.

`graph.yaml` owns the semantic graph:

```yaml
version: 1
title: Observatory Door
description: Restore power before decoding the lock.

nodes:
  - id: find-fuse
    title: Find the replacement fuse
    document: docs/find-fuse.md
    kind: insight
    summary: Notice the spare fuse in the workshop.
  - id: restore-power
    title: Restore observatory power
    document: docs/restore-power.md
    kind: goal

edges:
  - id: fuse-to-power
    from: find-fuse
    to: restore-power
    label: enables
```

Node `kind` is one of `constraint`, `insight`, `move`, `conversation`, or `goal`.

A conversation that changes game state should be a node. Required dialogue or puzzles unlocked by it are downstream nodes connected by edges.

TODO-list effects are authored as YAML in a source-only HTML comment at the start of the node's Markdown:

```markdown
<!-- puzzle-chart:todo-effects
- action: add
  id: relight-beacon
  label: Relight the lighthouse beacon
  order: 10
- action: add
  id: recover-compass
  label: Recover the ferryman's compass
  parent: relight-beacon
  order: 10
-->

# Puzzle notes
```

The comment is visible and directly editable in source mode, but it is removed from the WYSIWYG editor and rendered prose. Rich-text mode provides a dedicated **Player TODO effects** panel above the document. An action is `add`, `complete`, or `remove`; reusing a stable ID models one TODO item's lifecycle across documents. The optional `parent` field nests an item beneath another stable TODO ID, including a parent created in an earlier document. `order` is a non-negative integer that gives siblings a stable order; consumers sort by `order` and then stable ID. Values spaced by ten leave room for inserting siblings later. TODO effects are derived at load/edit time and are never duplicated into `graph.yaml`.

Design completeness is separate from kind. Add `status: tbd` to any node to give it a conspicuous purple treatment in the chart and minimap:

```yaml
  - id: shape-replacement-lens
    title: Shape a replacement lens
    document: docs/shape-replacement-lens.md
    kind: move
    status: tbd
```

`layout.json` owns visual state:

```json
{
  "nodes": {
    "find-fuse": { "x": 80, "y": 40 },
    "restore-power": { "x": 80, "y": 240 }
  },
  "edges": {
    "fuse-to-power": { "type": "bezier", "curvature": 0.32 }
  },
  "viewport": { "x": 40, "y": 30, "zoom": 0.9 }
}
```

Each edge may use `straight`, `bezier`, `step`, or `smoothstep`. Bézier edges accept `curvature`; stepped edges can use `borderRadius` and `offset`.

Paths are always relative to the project folder and cannot escape it. The loader validates duplicate IDs, edge endpoints, node kinds, positions, routes, and Markdown extensions before rendering or building.

## Commands

```bash
npm run dev -- [project-folder]    # TypeScript app + HMR + local writes
npm run build -- [project-folder]  # Static view-only site
npm run build:pages                # Build the hosted Clockwork Lighthouse example
npm run preview                    # Serve the most recent dist/ build
npm run typecheck
npm test
npm run check                      # Typecheck, tests, and default example build
```

The examples are:

- `examples/fox-chicken-grain/`: a compact traditional river-crossing puzzle that exercises nested Markdown paths and multiple edge routes.
- `examples/clockwork-lighthouse/`: an original, larger point-and-click scenario with four parallel branches, converging prerequisites, conversation unlocks, TODO lifecycles, and a visibly TBD puzzle.

Run the larger example with:

```bash
npm run dev -- examples/clockwork-lighthouse
```
