import { describe, expect, it } from "vitest";
import {
  compareTodoSiblingOrder,
  markdownWithoutTodoMetadata,
  parseTodoEffects,
  readTodoMetadata,
  replaceMarkdownBody,
  replaceTodoEffects,
} from "../src/lib/todo-markdown";

describe("Markdown TODO effects", () => {
  it("parses a source-only YAML comment into lifecycle effects", () => {
    const markdown = `<!-- puzzle-chart:todo-effects
- action: add
  id: relight-beacon
  label: Relight the beacon
- action: complete
  id: recover-compass
  label: Recover the compass
- action: remove
  id: old-reminder
  label: Hide the obsolete reminder
-->

# Puzzle notes
`;

    expect(parseTodoEffects(markdown)).toEqual([
      { id: "relight-beacon", action: "add", label: "Relight the beacon" },
      {
        id: "recover-compass",
        action: "complete",
        label: "Recover the compass",
      },
      {
        id: "old-reminder",
        action: "remove",
        label: "Hide the obsolete reminder",
      },
    ]);
  });

  it("only recognizes the metadata comment at the start of the document", () => {
    const markdown = `
# Ordinary notes

<!-- puzzle-chart:todo-effects
- action: add
  id: not-metadata
-->
`;

    expect(parseTodoEffects(markdown)).toEqual([]);
  });

  it("reports invalid source metadata without throwing while it is edited", () => {
    expect(
      readTodoMetadata(`<!-- puzzle-chart:todo-effects
- action: invent
  id: broken
-->

# Notes
`),
    ).toMatchObject({ effects: [], error: expect.stringContaining("action") });
  });

  it("keeps metadata out of rich text and preserves it when prose changes", () => {
    const markdown = `<!-- puzzle-chart:todo-effects
- action: add
  id: light-beacon
-->

# Old notes
`;
    expect(markdownWithoutTodoMetadata(markdown)).toBe("# Old notes\n");
    expect(replaceMarkdownBody(markdown, "# Revised notes\n")).toBe(
      `<!-- puzzle-chart:todo-effects
- action: add
  id: light-beacon
-->

# Revised notes
`,
    );
  });

  it("writes a canonical comment that round-trips", () => {
    const effects = [
      {
        action: "add" as const,
        id: "ask-around",
        label: "Ask around",
        order: 10,
      },
      {
        action: "add" as const,
        id: "find-key",
        parentId: "ask-around",
        order: 20,
      },
    ];
    const markdown = replaceTodoEffects("# Notes\n", effects);
    expect(markdown).toContain("<!-- puzzle-chart:todo-effects\n");
    expect(markdown).toContain("# Notes\n");
    expect(parseTodoEffects(markdown)).toEqual(effects);
  });

  it("gives siblings deterministic order independent of source order", () => {
    const siblings = [
      { action: "add" as const, id: "third", order: 30 },
      { action: "add" as const, id: "tie-b", order: 20 },
      { action: "add" as const, id: "tie-a", order: 20 },
      { action: "add" as const, id: "unordered" },
    ];

    expect(siblings.sort(compareTodoSiblingOrder).map((effect) => effect.id)).toEqual([
      "tie-a",
      "tie-b",
      "third",
      "unordered",
    ]);
  });
});
