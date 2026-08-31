import { parse, stringify } from "yaml";
import type { PuzzleGraph, TodoAction, TodoEffect } from "./project-types.ts";

export const todoCommentHeader = "puzzle-chart:todo-effects";

const todoIdPattern = /^[a-z0-9][a-z0-9._-]*$/i;
const todoCommentPattern = new RegExp(
  `^(?:\\uFEFF)?[ \\t]*(<!--[ \\t]*${todoCommentHeader}[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n[ \\t]*-->)[ \\t]*(?:\\r?\\n[ \\t]*)*`,
  "i",
);

interface TodoCommentMatch {
  body: string;
  comment?: string;
  yaml?: string;
}

export interface TodoMetadata {
  effects: TodoEffect[];
  error?: string;
}

function splitTodoComment(markdown: string): TodoCommentMatch {
  const match = todoCommentPattern.exec(markdown);
  if (!match) return { body: markdown };
  return {
    comment: match[1],
    yaml: match[2],
    body: markdown.slice(match[0].length),
  };
}

function parseEffect(value: unknown, index: number): TodoEffect {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`item ${index + 1} must be a YAML object`);
  }
  const source = value as Record<string, unknown>;
  if (
    !source.id ||
    typeof source.id !== "string" ||
    !todoIdPattern.test(source.id)
  ) {
    throw new Error(
      `item ${index + 1} needs an id using letters, numbers, dots, underscores, or hyphens`,
    );
  }
  if (
    typeof source.action !== "string" ||
    !["add", "complete", "remove"].includes(source.action)
  ) {
    throw new Error(`item ${index + 1} action must be add, complete, or remove`);
  }
  if (source.label !== undefined && typeof source.label !== "string") {
    throw new Error(`item ${index + 1} label must be text when present`);
  }
  if (
    source.parent !== undefined &&
    (typeof source.parent !== "string" || !todoIdPattern.test(source.parent))
  ) {
    throw new Error(`item ${index + 1} parent must be a valid stable ID`);
  }
  if (source.parent === source.id) {
    throw new Error(`item ${index + 1} cannot be its own parent`);
  }
  if (
    source.order !== undefined &&
    (typeof source.order !== "number" ||
      !Number.isInteger(source.order) ||
      source.order < 0)
  ) {
    throw new Error(`item ${index + 1} order must be a non-negative integer`);
  }
  return {
    action: source.action as TodoAction,
    id: source.id,
    ...(source.label?.trim() ? { label: source.label.trim() } : {}),
    ...(typeof source.parent === "string" ? { parentId: source.parent } : {}),
    ...(typeof source.order === "number" ? { order: source.order } : {}),
  };
}

export function readTodoMetadata(markdown: string): TodoMetadata {
  const { yaml } = splitTodoComment(markdown);
  if (yaml === undefined) return { effects: [] };
  try {
    const value = parse(yaml);
    if (value === null) return { effects: [] };
    if (!Array.isArray(value)) {
      throw new Error("the comment body must be a YAML list");
    }
    return { effects: value.map(parseEffect) };
  } catch (error) {
    return {
      effects: [],
      error: error instanceof Error ? error.message : "invalid TODO metadata",
    };
  }
}

export function parseTodoEffects(markdown: string): TodoEffect[] {
  return readTodoMetadata(markdown).effects;
}

/** Markdown body shown to the WYSIWYG editor and rendered document viewer. */
export function markdownWithoutTodoMetadata(markdown: string): string {
  return splitTodoComment(markdown).body;
}

/** Replaces WYSIWYG-authored prose without disturbing the source-only comment. */
export function replaceMarkdownBody(
  currentMarkdown: string,
  nextBody: string,
): string {
  const { comment } = splitTodoComment(currentMarkdown);
  if (!comment) return nextBody;
  return `${comment}\n\n${nextBody.replace(/^\s+/, "")}`;
}

/** Writes a canonical metadata comment at the start of the document. */
export function replaceTodoEffects(
  markdown: string,
  effects: TodoEffect[],
): string {
  const { body } = splitTodoComment(markdown);
  const normalizedBody = body.replace(/^\s+/, "");
  if (!effects.length) return normalizedBody;
  const yaml = stringify(
    effects.map((effect) => ({
      action: effect.action,
      id: effect.id,
      ...(effect.label ? { label: effect.label } : {}),
      ...(effect.parentId ? { parent: effect.parentId } : {}),
      ...(effect.order !== undefined ? { order: effect.order } : {}),
    })),
    { lineWidth: 0 },
  ).trimEnd();
  return `<!-- ${todoCommentHeader}\n${yaml}\n-->\n\n${normalizedBody}`;
}

/** Deterministic order for items that share the same parent. */
export function compareTodoSiblingOrder(
  left: TodoEffect,
  right: TodoEffect,
): number {
  return (
    (left.order ?? Number.MAX_SAFE_INTEGER) -
      (right.order ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id)
  );
}

export function hydrateGraphTodoEffects(
  graph: PuzzleGraph,
  documents: Record<string, string>,
): PuzzleGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const todo = parseTodoEffects(documents[node.document] ?? "");
      return {
        ...node,
        ...(todo.length ? { todo } : {}),
        ...(!todo.length ? { todo: undefined } : {}),
      };
    }),
  };
}
