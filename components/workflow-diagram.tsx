"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
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
  trigger: {
    shell: "border-black/12 bg-[#f7f7f5]",
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

const LIGHT_VARIANT_DARK_KINDS = new Set<DiagramNodeKind>([
  "start",
  "end",
  "agent",
]);

const MIN_FIT_ZOOM = 0.35;
const NODE_REVEAL_MS = 140;
const EDGE_REVEAL_MS = 90;

const CURRENT_LEGEND = [
  { label: "Start / done", dot: "bg-[#111113]" },
  { label: "Step", dot: "bg-black/15" },
  { label: "Decision", dot: "bg-amber-300" },
  { label: "Retry", dot: "bg-orange-300" },
] as const;

const AGENT_LEGEND = [
  { label: "Agent", dot: "bg-[#111113]" },
  { label: "Check", dot: "bg-emerald-400" },
  { label: "You", dot: "bg-sky-400" },
  { label: "Retry", dot: "bg-orange-300" },
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
        "pr-diagram-node w-[152px] rounded-xl border px-3 py-2.5",
        isLight
          ? "shadow-[0_8px_20px_-18px_rgba(17,17,19,0.45)]"
          : "shadow-[0_18px_40px_-28px_rgba(0,0,0,0.45)]",
        styles.shell,
      )}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-[0.06em] uppercase",
              styles.chip,
            )}
          >
            {data.kindLabel ?? data.kind}
          </span>
          {data.application ? <AppLogo name={data.application} size={12} /> : null}
        </div>
        <p
          className={cn(
            "pr-body text-[12.5px] leading-[1.35]",
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

function FitToCanvas({
  hostRef,
  bounds,
  revealKey,
}: {
  hostRef: React.RefObject<HTMLDivElement | null>;
  bounds: { width: number; height: number };
  revealKey: string;
}) {
  const { fitView, setViewport } = useReactFlow();

  useEffect(() => {
    if (!bounds.width || !bounds.height) return;

    const frame = requestAnimationFrame(() => {
      const host = hostRef.current;
      if (!host) return;
      const { width: canvasW, height: canvasH } = host.getBoundingClientRect();
      if (!canvasW || !canvasH) return;

      // Prefer React Flow's fitView; fall back to manual centering.
      void fitView({
        padding: 0.16,
        minZoom: MIN_FIT_ZOOM,
        maxZoom: 1,
        duration: 0,
      }).catch(() => {
        const padX = 20;
        const padY = 16;
        const zoom = Math.min(
          1,
          Math.max(
            MIN_FIT_ZOOM,
            Math.min(
              (canvasW - padX * 2) / bounds.width,
              (canvasH - padY * 2) / bounds.height,
            ),
          ),
        );
        setViewport({
          x: (canvasW - bounds.width * zoom) / 2,
          y: (canvasH - bounds.height * zoom) / 2,
          zoom,
        });
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [fitView, setViewport, hostRef, bounds.width, bounds.height, revealKey]);

  return null;
}

function useProgressiveReveal(
  nodes: Node[],
  edges: Edge[],
  revision: string,
  animate: boolean,
) {
  const [visibleNodeCount, setVisibleNodeCount] = useState(
    animate ? 0 : nodes.length,
  );
  const [visibleEdgeCount, setVisibleEdgeCount] = useState(
    animate ? 0 : edges.length,
  );

  useEffect(() => {
    if (!animate || nodes.length === 0) {
      setVisibleNodeCount(nodes.length);
      setVisibleEdgeCount(edges.length);
      return;
    }

    setVisibleNodeCount(0);
    setVisibleEdgeCount(0);

    let nodeIndex = 0;
    let edgeIndex = 0;
    let edgeTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    // Show the first node immediately so the canvas is never blank.
    nodeIndex = 1;
    setVisibleNodeCount(1);

    const nodeTimer = setInterval(() => {
      if (cancelled) return;
      nodeIndex += 1;
      setVisibleNodeCount(Math.min(nodeIndex, nodes.length));
      if (nodeIndex >= nodes.length) {
        clearInterval(nodeTimer);
        edgeTimer = setInterval(() => {
          if (cancelled) return;
          edgeIndex += 1;
          setVisibleEdgeCount(Math.min(edgeIndex, edges.length));
          if (edgeIndex >= edges.length && edgeTimer) {
            clearInterval(edgeTimer);
          }
        }, EDGE_REVEAL_MS);
      }
    }, NODE_REVEAL_MS);

    return () => {
      cancelled = true;
      clearInterval(nodeTimer);
      if (edgeTimer) clearInterval(edgeTimer);
    };
  }, [animate, revision, nodes.length, edges.length]);

  const visibleNodeIds = useMemo(() => {
    return new Set(nodes.slice(0, visibleNodeCount).map((node) => node.id));
  }, [nodes, visibleNodeCount]);

  // Opacity only — never animate transform on React Flow node wrappers,
  // or positioning transforms get overwritten and nodes vanish.
  const revealedNodes = useMemo(
    () =>
      nodes.slice(0, visibleNodeCount).map((node) => ({
        ...node,
        style: {
          ...node.style,
          opacity: 1,
          transition: "opacity 280ms ease",
        },
      })),
    [nodes, visibleNodeCount],
  );

  const revealedEdges = useMemo(() => {
    return edges
      .filter(
        (edge, index) =>
          index < visibleEdgeCount &&
          visibleNodeIds.has(edge.source) &&
          visibleNodeIds.has(edge.target),
      )
      .map((edge) => ({
        ...edge,
        style: {
          ...edge.style,
          opacity: 1,
          transition: "opacity 240ms ease",
        },
        animated: false,
      }));
  }, [edges, visibleEdgeCount, visibleNodeIds]);

  const revealKey = `${visibleNodeCount}:${visibleEdgeCount}`;
  const complete =
    visibleNodeCount >= nodes.length && visibleEdgeCount >= edges.length;

  return { revealedNodes, revealedEdges, revealKey, complete };
}

export function WorkflowDiagram({
  diagram,
  agentDiagram,
  workflow,
  variant = "default",
  title,
  caption,
  emptyMessage = "Not enough steps yet to draw this workflow.",
  animate = false,
  interactive = false,
  compact = false,
}: {
  diagram?: {
    nodes: WorkflowDiagramNode[];
    edges: WorkflowDiagramEdge[];
  };
  agentDiagram?: AgentDiagram | null;
  workflow?: WorkflowModel | null;
  variant?: "default" | "wonderful";
  title?: string;
  caption?: string;
  emptyMessage?: string;
  animate?: boolean;
  interactive?: boolean;
  /** Slim live-call chrome without a heavy bordered card. */
  compact?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
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

  const { revealedNodes, revealedEdges, revealKey } = useProgressiveReveal(
    laidOut.nodes,
    laidOut.edges,
    revision,
    animate,
  );

  const nodeTypes =
    variant === "wonderful" ? NODE_TYPES_WONDERFUL : NODE_TYPES_DEFAULT;

  if (!laidOut.nodes.length) {
    return (
      <div className="flex h-[160px] items-center justify-center px-4 text-center text-sm text-[var(--pr-muted,#6e6e6e)]">
        {emptyMessage}
      </div>
    );
  }

  const isLight = variant === "wonderful";
  const legend = isAgent ? AGENT_LEGEND : CURRENT_LEGEND;
  const headingTitle =
    title ?? (isAgent ? "How the agent would run it" : "Your workflow");
  const headingCaption =
    caption ??
    (isAgent
      ? "Left to right. Dashed lines are retries."
      : "Left to right.");

  const canvasHeight = compact
    ? Math.min(360, Math.max(220, Math.round(laidOut.bounds.height * 0.72) + 48))
    : Math.min(420, Math.max(220, Math.round(laidOut.bounds.height * 0.7) + 48));

  const canvas = (
    <div
      ref={hostRef}
      className="relative w-full"
      style={{ height: canvasHeight }}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={revealedNodes}
          edges={revealedEdges}
          nodeTypes={nodeTypes}
          minZoom={MIN_FIT_ZOOM}
          maxZoom={1.2}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={interactive}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={interactive}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          fitView
          fitViewOptions={{ padding: 0.16, minZoom: MIN_FIT_ZOOM, maxZoom: 1 }}
        >
          {!compact ? (
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1}
              color="rgba(23,23,25,0.07)"
            />
          ) : null}
          <FitToCanvas
            hostRef={hostRef}
            bounds={laidOut.bounds}
            revealKey={revealKey}
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );

  if (compact) {
    return <div className="w-full">{canvas}</div>;
  }

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
      {canvas}
    </div>
  );
}
