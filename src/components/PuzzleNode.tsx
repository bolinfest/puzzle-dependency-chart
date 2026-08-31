import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  CircleCheck,
  Compass,
  Footprints,
  ListTodo,
  MessagesSquare,
  ShieldAlert,
} from "lucide-react";
import type { PuzzleFlowNode } from "../lib/flow-model";
import type { PuzzleKind } from "../lib/project-types";

const kindMeta: Record<
  PuzzleKind,
  { label: string; icon: typeof ShieldAlert }
> = {
  constraint: { label: "Rule", icon: ShieldAlert },
  insight: { label: "Insight", icon: Compass },
  move: { label: "Action", icon: Footprints },
  conversation: { label: "Conversation", icon: MessagesSquare },
  goal: { label: "Goal", icon: CircleCheck },
};

export function PuzzleNode({
  data,
  selected,
  isConnectable,
}: NodeProps<PuzzleFlowNode>) {
  const { definition } = data;
  const meta = kindMeta[definition.kind];
  const Icon = meta.icon;

  return (
    <article
      className={`puzzle-node${selected ? " is-selected" : ""}`}
      data-kind={definition.kind}
      data-status={definition.status}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="node-handle"
        isConnectable={isConnectable}
      />
      <div className="node-kicker">
        <Icon size={13} strokeWidth={2} aria-hidden="true" />
        <span>{meta.label}</span>
        {definition.status === "tbd" ? <b className="tbd-badge">TBD</b> : null}
      </div>
      <h3>{definition.title}</h3>
      {definition.summary ? <p>{definition.summary}</p> : null}
      {definition.todo?.length ? (
        <div className="node-effects">
          {definition.todo.slice(0, 2).map((effect, index) => (
            <span key={`${effect.id}:${effect.action}:${index}`}>
              <ListTodo size={11} aria-hidden="true" />
              {effect.action === "add"
                ? "+ TODO"
                : effect.action === "complete"
                  ? "✓ TODO"
                  : "− TODO"}
            </span>
          ))}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="node-handle"
        isConnectable={isConnectable}
      />
    </article>
  );
}
