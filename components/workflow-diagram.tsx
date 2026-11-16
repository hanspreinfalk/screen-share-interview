"use client";

import { useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
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
    shell: "border-[#111113] bg-[#111113]",
    chip: "bg-white/15 text-white",
  },
  action: {
    shell: "border-black/10 bg-white",
    chip: "bg-[#f0f0ee] text-[#171719]",
  },
  decision: {
    shell: "border-amber-300/60 bg-[#fffdf5]",
    chip: "bg-amber-100 text-[#6b4e07]",
  },
  loop: {
    shell: "border-orange-300/50 bg-[#fff9f5]",
    chip: "bg-orange-100 text-[#7c3c12]",
  },
  end: {
    shell: "border-[#111113] bg-[#111113]",
    chip: "bg-white/15 text-white",
  },
  handoff: {
    shell: "border-black/10 bg-white",
    chip: "bg-[#f0f0ee] text-[#171719]",
  },
};

const DARK_NODE_KINDS = new Set<DiagramFlowNodeData["kind"]>(["start", "end"]);

const LEGEND = [
  { label: "Start / done", dot: "bg-[#111113]" },
  { label: "A step you do", dot: "bg-black/15" },
  { label: "A decision", dot: "bg-amber-300" },
  { label: "A retry loop", dot: "bg-orange-300" },
] as const;

function WorkflowNode({
  data,
  variant,
}: NodeProps & { data: DiagramFlowNodeData; variant: "default" | "wonderful" }) {
  const isLight = variant === "wonderful";
  const styles = isLight ? LIGHT_KIND_STYLES[data.kind] : KIND_STYLES[data.kind];
  const onDark = !isLight || DARK_NODE_KINDS.has(data.kind);
  const handleClass = cn(
    "!size-1.5 !border-0",
    isLight ? "!bg-black/25" : "!bg-white/40",
  );

  return (
    <div
      title={data.label}
      className={cn(
        "w-[196px] rounded-2xl border px-4 py-3.5",
        isLight
          ? "shadow-[0_12px_28px_-24px_rgba(17,17,19,0.5)]"
          : "shadow-[0_18px_40px_-28px_rgba(0,0,0,0.45)]",
        styles.shell,
      )}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[9.5px] font-medium tracking-[0.07em] uppercase",
              styles.chip,
            )}
          >
            {data.kindLabel}
          </span>
          {data.application ? (
            <span
              className={cn(
                "max-w-[5.5rem] truncate text-[10.5px] tracking-[-0.01em]",
                onDark ? "text-white/45" : "text-black/40",
              )}
            >
              {data.application}
            </span>
          ) : null}
        </div>
        <p
          className={cn(
            "text-[13px] leading-[1.45] tracking-[-0.015em]",
            onDark ? "text-white" : "text-[#171719]",
          )}
        >
          {data.label}
        </p>
      </div>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </div>
  );
}

function FitViewOnce({ revision }: { revision: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void fitView({ padding: 0.12, duration: 240 });
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
      <div className="flex h-[260px] items-center justify-center rounded-[1.5rem] border border-black/8 bg-white px-6 text-center text-sm text-[var(--pr-muted,#6e6e6e)]">
        Not enough steps yet to draw this workflow.
      </div>
    );
  }

  const isLight = variant === "wonderful";

  // Size the canvas to the graph so a short flow doesn't sit in dead space.
  const canvasHeight = Math.min(
    460,
    Math.max(240, laidOut.bounds.height + 72),
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.5rem] border",
        isLight
          ? "border-black/8 bg-white"
          : "border-border bg-[linear-gradient(135deg,oklch(0.99_0.01_95),oklch(0.97_0.01_230))]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/[0.055] px-6 py-5">
        <div className="space-y-1">
          <p className="pr-label">Your workflow, start to finish</p>
          <p className="pr-body text-[13px] text-[var(--pr-muted,#6e6e6e)]">
            Reads left to right. Curved lines are the “try again” loops.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {LEGEND.map((item) => (
            <span
              key={item.label}
              className="pr-body flex items-center gap-2 text-[11.5px] text-[var(--pr-muted,#6e6e6e)]"
            >
              <span
                aria-hidden
                className={cn("size-2 rounded-full", item.dot)}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="w-full" style={{ height: canvasHeight }}>
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
            // Let the page scroll normally over the diagram; it's a static
            // graphic in a long report, not an interactive canvas.
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1}
              color="rgba(23,23,25,0.07)"
            />
            <FitViewOnce revision={revision} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
