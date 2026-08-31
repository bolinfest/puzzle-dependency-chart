// @vitest-environment jsdom

import { useState, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("@mdxeditor/editor", () => {
  const plugin = () => ({});
  return {
    MDXEditor: ({
      markdown,
      onChange,
    }: {
      markdown: string;
      onChange: (markdown: string) => void;
    }) => {
      // MDXEditor consumes markdown only when it mounts. This mock preserves that
      // behavior so the test catches selection changes that fail to remount it.
      const [initialMarkdown] = useState(markdown);
      return (
        <div>
          <div data-testid="mounted-markdown">{initialMarkdown}</div>
          <button
            type="button"
            data-testid="simulate-rich-change"
            onClick={() => onChange("# Revised prose\n")}
          />
        </div>
      );
    },
    DiffSourceToggleWrapper: ({ children }: { children: ReactNode }) => children,
    UndoRedo: () => null,
    BlockTypeSelect: () => null,
    BoldItalicUnderlineToggles: () => null,
    ListsToggle: () => null,
    CreateLink: () => null,
    InsertTable: () => null,
    InsertCodeBlock: () => null,
    codeBlockPlugin: plugin,
    codeMirrorPlugin: plugin,
    diffSourcePlugin: plugin,
    headingsPlugin: plugin,
    linkDialogPlugin: plugin,
    linkPlugin: plugin,
    listsPlugin: plugin,
    markdownShortcutPlugin: plugin,
    quotePlugin: plugin,
    tablePlugin: plugin,
    thematicBreakPlugin: plugin,
    toolbarPlugin: plugin,
  };
});

import { MarkdownPane } from "../src/components/MarkdownPane";
import type { PuzzleNodeDefinition } from "../src/lib/project-types";

const firstNode: PuzzleNodeDefinition = {
  id: "first",
  title: "First node",
  document: "docs/first.md",
  kind: "move",
};
const secondNode: PuzzleNodeDefinition = {
  id: "second",
  title: "Second node",
  document: "docs/second.md",
  kind: "insight",
};

describe("MarkdownPane selection", () => {
  it("mounts the newly selected document instead of the previous Markdown", () => {
    const { rerender } = render(
      <MarkdownPane
        node={firstNode}
        markdown="# First document"
        editable={false}
        onChange={() => undefined}
      />,
    );

    rerender(
      <MarkdownPane
        node={secondNode}
        markdown="# Second document"
        editable={false}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("mounted-markdown").textContent).toBe(
      "# Second document",
    );
  });

  it("keeps TODO metadata out of rich text and preserves it on edits", () => {
    const onChange = vi.fn();
    const markdown = `<!-- puzzle-chart:todo-effects
- action: add
  id: ask-around
  label: Ask around
-->

# Visible prose
`;
    render(
      <MarkdownPane
        node={firstNode}
        markdown={markdown}
        editable
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId("mounted-markdown").textContent).toBe(
      "# Visible prose\n",
    );
    fireEvent.click(screen.getByTestId("simulate-rich-change"));
    expect(onChange).toHaveBeenLastCalledWith(
      `<!-- puzzle-chart:todo-effects
- action: add
  id: ask-around
  label: Ask around
-->

# Revised prose
`,
    );
  });

  it("shows the complete file, including TODO metadata, in source mode", () => {
    const markdown = `<!-- puzzle-chart:todo-effects
- action: complete
  id: ask-around
-->

# Notes
`;
    render(
      <MarkdownPane
        node={firstNode}
        markdown={markdown}
        editable
        onChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(
      (screen.getByRole("textbox", {
        name: "First node Markdown source",
      }) as HTMLTextAreaElement).value,
    ).toBe(markdown);
  });
});
