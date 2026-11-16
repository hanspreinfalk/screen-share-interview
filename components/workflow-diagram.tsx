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

import { AppLogo } from "@/components/app-logo";
import {
  layoutDiagram,
  preferDiagram,
  prepareAgentDiagram,
  type DiagramFlowNodeData,
  type DiagramNodeKind,
} from "@/lib/workflow-diagram";
import type {
  AgentDiagram,
  WorkflowDiagramEdge,
  WorkflowDiagramNode,
  WorkflowModel,
} from "@/lib/workflow-model";
import { cn } from "@/lib/utils";

type KindStyle = { shell: string; chip: string };

const DARK_KIND_STYLES: Record<DiagramNodeKind, KindStyle> = {
  start: { shell: "border-white/15 bg-white/10", chip: "bg-white text-[#111113]" },
  action: { shell: "border-white/12 bg-[#17171a]", chip: "bg-white/15 text-white" },
  decision: {
    shell: "border-white/20 bg-[#1d1a14]",
    chip: "bg-amber-200/90 text-[#111113]",
  },
  loop: {
    shell: "border-orange-200/20 bg-[#1c1612]",
    chip: "bg-orange-200/90 text-[#111113]",
  },
  end: { shell: "border-white/15 bg-white/10", chip: "bg-white text-[#111113]" },
  handoff: { shell: "border-white/12 bg-[#16141c]", chip: "bg-white/15 text-white" },
  trigger: { shell: "border-white/15 bg-white/10", chip: "bg-white text-[#111113]" },
  agent: { shell: "border-white/12 bg-[#17171a]", chip: "bg-white/15 text-white" },
  verify: {
    shell: "border-emerald-200/20 bg-[#121a17]",
    chip: "bg-emerald-200/90 text-[#111113]",
  },
  human: {
    shell: "border-sky-200/20 bg-[#121820]",
    chip: "bg-sky-200/90 text-[#111113]",
  },
};

const LIGHT_KIND_STYLES: Record<DiagramNodeKind, KindStyle> = {
  start: { shell: "border-[#111113] bg-[#111113]", chip: "bg-white/15 text-white" },
  action: { shell: "border-black/10 bg-white", chip: "bg-[#f0f0ee] text-[#171719]" },
  decision: {
    shell: "border-amber-300/60 bg-[#fffdf5]",
    chip: "bg-amber-100 text-[#6b4e07]",
  },
  loop: {
    shell: "border-orange-300/50 bg-[#fff9f5]",
    chip: "bg-orange-100 text-[#7c3c12]",
  },
  end: { shell: "border-[#111113] bg-[#111113]", chip: "bg-white/15 text-white" },
  handoff: { shell: "border-black/10 bg-white", chip: "bg-[#f0f0ee] text-[#171719]" },
  // Agent diagram: the agent owns the dark nodes so the division of labour
  // between machine and human reads at a glance.
  trigger: {
    shell: "border-black/12 bg-[#f6f6f4]",
    chip: "bg-[#111113] text-white",
  },
  agent: { shell: "border-[#111113] bg-[#111113]", chip: "bg-white/18 text-white" },
  verify: {
    shell: "border-emerald-300/50 bg-[#f5fbf7]",
    chip: "bg-emerald-100 text-[#1c5138]",
  },
  human: {
    shell: "border-sky-300/50 bg-[#f5f9fd]",
    chip: "bg-sky-100 text-[#1d4a6b]",
  },
};

/** Node kinds rendered on a dark fill in the light (report) variant. */
const LIGHT_VARIANT_DARK_KINDS = new Set<DiagramNodeKind>([
  "start",
  "end",
  "agent",
]);

/**
 * Smallest zoom we will render at by default. Below this the 13px node labels
 * stop being readable, so a wider graph pans instead of shrinking.
 */
const MIN_READABLE_ZOOM = 0.88;

const CURRENT_LEGEND = [
  { label: "Start / done", dot: "bg-[#111113]" },
  { label: "A step you do", dot: "bg-black/15" },
  { label: "A decision", dot: "bg-amber-300" },
  { label: "A retry loop", dot: "bg-orange-300" },
] as const;

const AGENT_LEGEND = [
  { label: "Agent handles it", dot: "bg-[#111113]" },
  { label: "Self check", dot: "bg-emerald-400" },
  { label: "You stay in control", dot: "bg-sky-400" },
  { label: "Retry or escalate", dot: "bg-orange-300" },
] as const;

function WorkflowNodeWonderful(props: NodeProps & { data: DiagramFlowNodeData }) {
  return <WorkflowNode {...props} variant="wonderful" />;
}

function WorkflowNodeDefault(props: NodeProps & { data: DiagramFlowNodeData }) {
  return <WorkflowNode {...props} variant="default" />;
}

const NODE_TYPES_WONDERFUL = { workflow: WorkflowNodeWonderful };
const NODE_TYPES_DEFAULT = { workflow: WorkflowNodeDefault };

function WorkflowNode({
  data,
  variant,
}: NodeProps & { data: DiagramFlowNodeData; variant: "default" | "wonderful" }) {
  const isLight = variant === "wonderful";
  const styles = isLight ? LIGHT_KIND_STYLES[data.kind] : DARK_KIND_STYLES[data.kind];
  const onDark = !isLight || LIGHT_VARIANT_DARK_KINDS.has(data.kind);
  const handleClass = cn(
    "!size-1.5 !border-0",
    isLight ? "!bg-black/25" : "!bg-white/40",
  );

  return (
    <div
      title={data.application ? `${data.label} (${data.application})` : data.label}
      className={cn(
        "w-[168px] rounded-2xl border px-3.5 py-3",
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
            <span className="flex min-w-0 items-center gap-1.5">
              <AppLogo name={data.application} size={13} onDark={onDark} />
              <span
                className={cn(
                  "max-w-[4.75rem] truncate text-[10.5px] tracking-[-0.01em]",
                  onDark ? "text-white/45" : "text-black/40",
                )}
              >
                {data.application}
              </span>
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

/**
 * Positions the graph deterministically: scaled down only until labels would
 * stop being readable, then anchored at the start of the flow so it reads from
 * the beginning and the user drags to follow it.
 */
function FitToCanvas({
  revision,
  bounds,
}: {
  revision: string;
  bounds: { width: number; height: number };
}) {
  const { setViewport } = useReactFlow();

  useEffect(() => {
    if (!bounds.width || !bounds.height) return;

    // Two frames: the first lets React Flow mount and measure its container,
    // the second applies our viewport so it is not overwritten.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const host = document.querySelector<HTMLElement>(
          `[data-diagram-revision="${CSS.escape(revision)}"]`,
        );
        if (!host) return;

        const { width: canvasW, height: canvasH } =
          host.getBoundingClientRect();
        if (!canvasW || !canvasH) return;

        const padX = 26;
        const padY = 20;
        const zoom = Math.min(
          1,
          Math.max(
            MIN_READABLE_ZOOM,
            Math.min(
              (canvasW - padX * 2) / bounds.width,
              (canvasH - padY * 2) / bounds.height,
            ),
          ),
        );

        const scaledW = bounds.width * zoom;
        const scaledH = bounds.height * zoom;
        const fits = scaledW + padX * 2 <= canvasW;

        setViewport({
          x: fits ? (canvasW - scaledW) / 2 : padX,
          y: Math.max(padY, (canvasH - scaledH) / 2),
          zoom,
        });
      });
    });

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [setViewport, revision, bounds.width, bounds.height]);

  return null;
}

export function WorkflowDiagram({
  diagram,
  agentDiagram,
  workflow,
  variant = "default",
  title,
  caption,
  emptyMessage = "Not enough steps yet to draw this workflow.",
}: {
  diagram?: {
    nodes: WorkflowDiagramNode[];
    edges: WorkflowDiagramEdge[];
  };
  /** When provided, renders the proposed autonomous workflow instead. */
  agentDiagram?: AgentDiagram | null;
  workflow?: WorkflowModel | null;
  variant?: "default" | "wonderful";
  title?: string;
  caption?: string;
  emptyMessage?: string;
}) {
  const isAgent = Boolean(agentDiagram);

  const resolved = useMemo(
    () =>
      agentDiagram
        ? prepareAgentDiagram(agentDiagram)
        : preferDiagram(diagram, workflow),
    [agentDiagram, diagram, workflow],
  );
  const laidOut = useMemo(() => layoutDiagram(resolved), [resolved]);
  const revision = useMemo(
    () =>
      `${resolved.nodes.map((n) => n.id).join("|")}:${resolved.edges
        .map((e) => e.id)
        .join("|")}`,
    [resolved],
  );

  const nodeTypes =
    variant === "wonderful" ? NODE_TYPES_WONDERFUL : NODE_TYPES_DEFAULT;

  if (!laidOut.nodes.length) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-[1.5rem] border border-black/8 bg-white px-6 text-center text-sm text-[var(--pr-muted,#6e6e6e)]">
        {emptyMessage}
      </div>
    );
  }

  const isLight = variant === "wonderful";
  const legend = isAgent ? AGENT_LEGEND : CURRENT_LEGEND;
  const headingTitle =
    title ?? (isAgent ? "How the agent would run it" : "Your workflow, start to finish");
  const headingCaption =
    caption ??
    (isAgent
      ? "Reads left to right. Dashed lines are retries and escalations."
      : "Reads left to right. Curved lines are the “try again” loops.");

  // Canvas hugs the graph at its rendered scale, so a short flow does not sit
  // in dead space and a tall one is not cropped.
  const canvasHeight = Math.min(
    520,
    Math.max(260, Math.round(laidOut.bounds.height * MIN_READABLE_ZOOM) + 56),
  );

  // At the readable floor, does the flow still exceed a report column?
  const mayOverflow = laidOut.bounds.width * MIN_READABLE_ZOOM > 700;

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
          <p className="pr-label">{headingTitle}</p>
          <p className="pr-body text-[13px] text-[var(--pr-muted,#6e6e6e)]">
            {headingCaption}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {legend.map((item) => (
            <span
              key={item.label}
              className="pr-body flex items-center gap-2 text-[11.5px] text-[var(--pr-muted,#6e6e6e)]"
            >
              <span aria-hidden className={cn("size-2 rounded-full", item.dot)} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div
        className="relative w-full"
        style={{ height: canvasHeight }}
        data-diagram-revision={revision}
      >
        <ReactFlowProvider>
          <ReactFlow
            nodes={laidOut.nodes}
            edges={laidOut.edges}
            nodeTypes={nodeTypes}
            minZoom={MIN_READABLE_ZOOM}
            maxZoom={1.4}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            // Drag to follow a wide flow, but never hijack page scroll: this
            // sits inside a long report.
            panOnDrag
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1}
              color="rgba(23,23,25,0.07)"
            />
            <FitToCanvas revision={revision} bounds={laidOut.bounds} />
          </ReactFlow>
        </ReactFlowProvider>
        {mayOverflow ? (
          <span className="pr-body pointer-events-none absolute right-4 bottom-3 rounded-full bg-white/85 px-2.5 py-1 text-[10.5px] tracking-[0.03em] text-[var(--pr-muted)] uppercase backdrop-blur-sm">
            Drag to explore
          </span>
        ) : null}      </div>
    </div>
  );
}
