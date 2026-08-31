import { useMemo, useRef, useState } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertCodeBlock,
  InsertTable,
  ListsToggle,
  MDXEditor,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import {
  BookOpenText,
  CheckCircle2,
  FileCode2,
  FileText,
  ListPlus,
  ListTodo,
  ListX,
  Plus,
  Trash2,
} from "lucide-react";
import {
  markdownWithoutTodoMetadata,
  readTodoMetadata,
  replaceMarkdownBody,
  replaceTodoEffects,
  todoCommentHeader,
} from "../lib/todo-markdown";
import type {
  PuzzleNodeDefinition,
  TodoAction,
  TodoEffect,
} from "../lib/project-types";

interface MarkdownPaneProps {
  node?: PuzzleNodeDefinition;
  markdown: string;
  editable: boolean;
  onChange: (markdown: string) => void;
}

export function MarkdownPane({
  node,
  markdown,
  editable,
  onChange,
}: MarkdownPaneProps) {
  const [editorView, setEditorView] = useState<"rich-text" | "source">(
    "rich-text",
  );
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const markdownRef = useRef(markdown);
  markdownRef.current = markdown;

  const metadata = useMemo(() => readTodoMetadata(markdown), [markdown]);
  const markdownBody = useMemo(
    () => markdownWithoutTodoMetadata(markdown),
    [markdown],
  );
  const showRichText = !editable || editorView === "rich-text";

  const plugins = useMemo(() => {
    const core = [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      tablePlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: "text" }),
      codeMirrorPlugin({
        codeBlockLanguages: {
          text: "Plain text",
          yaml: "YAML",
          json: "JSON",
          javascript: "JavaScript",
          typescript: "TypeScript",
        },
      }),
      markdownShortcutPlugin(),
    ];
    if (!editable) return core;
    return [
      ...core,
      toolbarPlugin({
        toolbarClassName: "editor-toolbar",
        toolbarContents: () => (
          <>
            <UndoRedo />
            <BlockTypeSelect />
            <BoldItalicUnderlineToggles />
            <ListsToggle />
            <CreateLink />
            <InsertTable />
            <InsertCodeBlock />
          </>
        ),
      }),
    ];
  }, [editable]);

  if (!node) {
    return (
      <section className="empty-document">
        <BookOpenText size={30} strokeWidth={1.6} aria-hidden="true" />
        <h2>Select a puzzle</h2>
        <p>Choose a node in the chart to read its design notes.</p>
      </section>
    );
  }

  return (
    <section className="document-pane" aria-label={`${node.title} documentation`}>
      <header className="document-header">
        <div>
          <span className="eyebrow">Puzzle notes</span>
          <h2>{node.title}</h2>
        </div>
        <div className="document-path" title={node.document}>
          <FileText size={14} aria-hidden="true" />
          <span>{node.document}</span>
        </div>
        {editable ? (
          <div className="document-view-switch" aria-label="Document editor view">
            <button
              type="button"
              className={editorView === "rich-text" ? "is-active" : ""}
              onClick={() => setEditorView("rich-text")}
              aria-pressed={editorView === "rich-text"}
            >
              <BookOpenText size={13} aria-hidden="true" />
              Rich text
            </button>
            <button
              type="button"
              className={editorView === "source" ? "is-active" : ""}
              onClick={() => setEditorView("source")}
              aria-pressed={editorView === "source"}
            >
              <FileCode2 size={13} aria-hidden="true" />
              Source
            </button>
          </div>
        ) : null}
      </header>
      {showRichText ? (
        <>
          {(editable || metadata.effects.length > 0) && (
            <TodoEffectsPanel
              effects={metadata.effects}
              editable={editable}
              onChange={(effects) => {
                const next = replaceTodoEffects(markdownRef.current, effects);
                markdownRef.current = next;
                onChangeRef.current(next);
              }}
            />
          )}
          <div className="editor-scroll">
            <MDXEditor
              key={`${node.document}:${editable ? "edit" : "view"}`}
              markdown={markdownBody}
              readOnly={!editable}
              contentEditableClassName="puzzle-markdown"
              plugins={plugins}
              onChange={(nextBody) => {
                const next = replaceMarkdownBody(markdownRef.current, nextBody);
                markdownRef.current = next;
                onChangeRef.current(next);
              }}
            />
          </div>
        </>
      ) : (
        <div className="source-editor-shell">
          <div
            className={`source-metadata-note${metadata.error ? " is-error" : ""}`}
            role={metadata.error ? "alert" : undefined}
          >
            <ListTodo size={14} aria-hidden="true" />
            {metadata.error
              ? `TODO metadata error: ${metadata.error}`
              : `TODO effects are stored in the ${todoCommentHeader} comment at the top.`}
          </div>
          <textarea
            className="markdown-source-editor"
            value={markdown}
            onChange={(event) => {
              markdownRef.current = event.currentTarget.value;
              onChangeRef.current(event.currentTarget.value);
            }}
            aria-label={`${node.title} Markdown source`}
            spellCheck={false}
          />
        </div>
      )}
    </section>
  );
}

const actionLabels: Record<TodoAction, string> = {
  add: "Add",
  complete: "Complete",
  remove: "Remove",
};

function uniqueTodoId(effects: TodoEffect[]): string {
  const ids = new Set(effects.map((effect) => effect.id));
  if (!ids.has("todo-item")) return "todo-item";
  let suffix = 2;
  while (ids.has(`todo-item-${suffix}`)) suffix += 1;
  return `todo-item-${suffix}`;
}

function nextTodoOrder(effects: TodoEffect[], parentId?: string): number {
  const siblingOrders = effects
    .filter((effect) => effect.parentId === parentId)
    .map((effect) => effect.order)
    .filter((order): order is number => order !== undefined);
  return siblingOrders.length ? Math.max(...siblingOrders) + 10 : 10;
}

interface TodoEffectsPanelProps {
  effects: TodoEffect[];
  editable: boolean;
  onChange: (effects: TodoEffect[]) => void;
}

function TodoEffectsPanel({
  effects,
  editable,
  onChange,
}: TodoEffectsPanelProps) {
  const update = (index: number, patch: Partial<TodoEffect>) => {
    onChange(
      effects.map((effect, effectIndex) =>
        effectIndex === index ? { ...effect, ...patch } : effect,
      ),
    );
  };

  return (
    <section className="todo-effects-panel" aria-label="Player TODO effects">
      <header className="todo-effects-heading">
        <div>
          <span>
            <ListTodo size={13} aria-hidden="true" /> Player TODO effects
          </span>
          <small>Changes to the player&apos;s in-game task list caused here</small>
        </div>
        {editable ? (
          <button
            type="button"
            onClick={() =>
              onChange([
                ...effects,
                {
                  action: "add",
                  id: uniqueTodoId(effects),
                  label: "New TODO item",
                  order: nextTodoOrder(effects),
                },
              ])
            }
          >
            <Plus size={13} aria-hidden="true" /> Add effect
          </button>
        ) : null}
      </header>
      {effects.length ? (
        <div className="todo-effects-list">
          {effects.map((effect, index) => {
            const Icon =
              effect.action === "add"
                ? ListPlus
                : effect.action === "complete"
                  ? CheckCircle2
                  : ListX;
            if (!editable) {
              return (
                <div
                  className="todo-effect-display"
                  data-action={effect.action}
                  data-nested={effect.parentId ? "true" : undefined}
                  key={`${effect.id}:${effect.action}:${index}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span className="todo-action-label">
                    {actionLabels[effect.action]}
                  </span>
                  <strong>{effect.label ?? effect.id}</strong>
                  <span className="todo-effect-identity">
                    <code>{effect.id}</code>
                    {effect.parentId ? (
                      <small>
                        under <code>{effect.parentId}</code>
                      </small>
                    ) : null}
                    {effect.order !== undefined ? (
                      <small>order {effect.order}</small>
                    ) : null}
                  </span>
                </div>
              );
            }
            return (
              <div
                className="todo-effect-row"
                key={`${effect.id}:${effect.action}:${index}`}
              >
                <select
                  value={effect.action}
                  onChange={(event) =>
                    update(index, { action: event.target.value as TodoAction })
                  }
                  aria-label={`Action for TODO effect ${index + 1}`}
                >
                  {Object.entries(actionLabels).map(([action, label]) => (
                    <option key={action} value={action}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  key={`${effect.id}:label:${effect.label ?? ""}`}
                  defaultValue={effect.label ?? ""}
                  placeholder="Player-facing label"
                  onBlur={(event) =>
                    update(index, {
                      label: event.currentTarget.value.trim() || undefined,
                    })
                  }
                  aria-label={`Label for TODO effect ${index + 1}`}
                />
                <input
                  key={`${effect.id}:id`}
                  defaultValue={effect.id}
                  spellCheck={false}
                  onBlur={(event) => {
                    const id = event.currentTarget.value.trim();
                    if (/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
                      update(index, { id });
                    } else {
                      event.currentTarget.value = effect.id;
                    }
                  }}
                  aria-label={`Stable ID for TODO effect ${index + 1}`}
                />
                <input
                  key={`${effect.id}:parent:${effect.parentId ?? ""}`}
                  defaultValue={effect.parentId ?? ""}
                  placeholder="Parent ID (optional)"
                  spellCheck={false}
                  onBlur={(event) => {
                    const parentId = event.currentTarget.value.trim();
                    if (
                      !parentId ||
                      (/^[a-z0-9][a-z0-9._-]*$/i.test(parentId) &&
                        parentId !== effect.id)
                    ) {
                      update(index, { parentId: parentId || undefined });
                    } else {
                      event.currentTarget.value = effect.parentId ?? "";
                    }
                  }}
                  aria-label={`Parent ID for TODO effect ${index + 1}`}
                />
                <input
                  className="todo-effect-order"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={effect.order ?? ""}
                  placeholder="Order"
                  onBlur={(event) => {
                    const value = event.currentTarget.value.trim();
                    const order = Number(value);
                    if (!value || (Number.isInteger(order) && order >= 0)) {
                      update(index, { order: value ? order : undefined });
                    } else {
                      event.currentTarget.value = String(effect.order ?? "");
                    }
                  }}
                  aria-label={`Sibling order for TODO effect ${index + 1}`}
                />
                <button
                  type="button"
                  className="icon-danger-button"
                  onClick={() =>
                    onChange(effects.filter((_, effectIndex) => effectIndex !== index))
                  }
                  aria-label={`Remove TODO effect ${effect.label ?? effect.id}`}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="todo-effects-empty">
          No TODO-list change occurs at this node.
        </p>
      )}
    </section>
  );
}
