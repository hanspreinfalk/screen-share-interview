"use client";

import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  layoutDiagram,
  preferDiagram,
  type DiagramFlowNodeData,
} from "@/lib/workflow-diagram";
import type {
  WorkflowDiagramEdge,
  WorkflowDiagramNode,
  WorkflowModel,
} from "@/lib/workflow-model";
import { cn } from "@/lib/utils";

const KIND_STYLES: Record<
  DiagramFlowNodeData["kind"],
  { shell: string; chip: string }
> = {
  start: {
    shell: "border-white/15 bg-white/10",
    chip: "bg-white text-[#111113]",
  },
  action: {
    shell: "border-white/12 bg-[#17171a]",
    chip: "bg-white/15 text-white",
  },
  decision: {
    shell: "border-white/20 bg-[#1d1a14]",
    chip: "bg-amber-200/90 text-[#111113]",
  },
  loop: {
    shell: "border-orange-200/20 bg-[#1c1612]",
    chip: "bg-orange-200/90 text-[#111113]",
  },
  end: {
    shell: "border-white/15 bg-white/10",
    chip: "bg-white text-[#111113]",
  },
  handoff: {
    shell: "border-white/12 bg-[#16141c]",
    chip: "bg-white/15 text-white",
  },
};

const LIGHT_KIND_STYLES: Record<
  DiagramFlowNodeData["kind"],
  { shell: string; chip: string }
> = {
  start: {
    shell: "border-black/8 bg-white",
    chip: "bg-[#111113] text-white",
  },
  action: {
    shell: "border-black/8 bg-white",
    chip: "bg-[#171719] text-white",
  },
  decision: {
    shell: "border-black/10 bg-[#fffaf0]",
    chip: "bg-[#111113] text-white",
  },
  loop: {
    shell: "border-black/10 bg-[#fff7f2]",
    chip: "bg-[#111113] text-white",
  },
  end: {
    shell: "border-black/8 bg-white",
    chip: "bg-[#111113] text-white",
  },
  handoff: {
    shell: "border-black/8 bg-white",
    chip: "bg-[#111113] text-white",
  },
};

function WorkflowNode({
  data,
  variant,
}: NodeProps & { data: DiagramFlowNodeData; variant: "default" | "wonderful" }) {
  const styles =
    variant === "wonderful"
      ? LIGHT_KIND_STYLES[data.kind]
      : KIND_STYLES[data.kind];

  return (
    <div
      title={data.label}
      className={cn(
        "w-[200px] rounded-[1.15rem] border px-3.5 py-3 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.45)]",
        styles.shell,
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-2 !border-white !bg-[#111113]"
      />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[-0.02em]",
              styles.chip,
            )}
          >
            {data.kindLabel}
          </span>
          {data.application ? (
            <span className="truncate text-[11px] text-[var(--pr-muted,#6e6e6e)]">
              {data.application}
            </span>
          ) : null}
        </div>
        <p
          className={cn(
            "text-[13px] leading-snug tracking-[-0.02em]",
            variant === "wonderful" ? "text-[#171719]" : "text-white",
          )}
        >
          {data.label}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2.5 !border-2 !border-white !bg-[#111113]"
      />
    </div>
  );
}

function FitViewOnce({ revision }: { revision: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void fitView({ padding: 0.22, duration: 220 });
    });
    return () => cancelAnimationFrame(id);
  }, [fitView, revision]);
  return null;
}

export function WorkflowDiagram({
  diagram,
  workflow,
  variant = "default",
}: {
  diagram?: {
    nodes: WorkflowDiagramNode[];
    edges: WorkflowDiagramEdge[];
  };
  workflow?: WorkflowModel | null;
  variant?: "default" | "wonderful";
}) {
  const resolved = useMemo(
    () => preferDiagram(diagram, workflow),
    [diagram, workflow],
  );
  const laidOut = useMemo(() => layoutDiagram(resolved), [resolved]);
  const revision = useMemo(
    () =>
      `${resolved.nodes.map((n) => n.id).join("|")}:${resolved.edges.map((e) => e.id).join("|")}`,
    [resolved],
  );

  const nodeTypes = useMemo(
    () => ({
      workflow: (props: NodeProps & { data: DiagramFlowNodeData }) => (
        <WorkflowNode {...props} variant={variant} />
      ),
    }),
    [variant],
  );

  if (!laidOut.nodes.length) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-[1.35rem] border border-black/8 bg-white px-6 text-center text-sm text-[var(--pr-muted,#6e6e6e)]">
        Not enough steps yet to draw this workflow.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.35rem] border",
        variant === "wonderful"
          ? "border-black/8 bg-white"
          : "border-border bg-[linear-gradient(135deg,oklch(0.99_0.01_95),oklch(0.97_0.01_230))]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/6 px-5 py-4">
        <div>
          <p className="pr-body text-sm text-[#171719]">Your workflow</p>
          <p className="pr-body text-xs text-[var(--pr-muted,#6e6e6e)]">
            Left to right. Loops mean “try again.”
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-[var(--pr-muted,#6e6e6e)]">
          <span>Start / Done</span>
          <span>Question</span>
          <span>Retry path</span>
        </div>
      </div>
      <div className="h-[320px] w-full md:h-[380px]">
        <ReactFlowProvider>
          <ReactFlow
            nodes={laidOut.nodes}
            edges={laidOut.edges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.3}
            maxZoom={1.4}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnScroll
            zoomOnScroll
          >
            <Background gap={24} size={1} color="rgba(23,23,25,0.06)" />
            <Controls
              showInteractive={false}
              className="!overflow-hidden !rounded-full !border-black/8 !bg-white !shadow-none"
            />
            <FitViewOnce revision={revision} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
