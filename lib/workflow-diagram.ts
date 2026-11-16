import {
  graphlib as dagreGraphlib,
  layout as dagreLayout,
} from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import { MarkerType, Position } from "@xyflow/react";

import type {
  EvidenceSource,
  WorkflowDiagramEdge,
  WorkflowDiagramNode,
  WorkflowModel,
} from "@/lib/workflow-model";

export type DiagramFlowNodeData = {
  label: string;
  kind: WorkflowDiagramNode["kind"];
  kindLabel: string;
  application?: string;
  source: EvidenceSource;
  sourceLabel: string;
};

const NODE_WIDTH = 196;
const NODE_HEIGHT = 84;

const KIND_LABELS: Record<WorkflowDiagramNode["kind"], string> = {
  start: "Start",
  action: "Step",
  decision: "Question",
  loop: "Retry",
  end: "Done",
  handoff: "Handoff",
};

const SOURCE_LABELS: Record<EvidenceSource, string> = {
  observed: "Seen live",
  explained: "You described",
  inferred: "Inferred",
};

function friendlyEdgeLabel(raw?: string, kind?: WorkflowDiagramEdge["kind"]) {
  const value = (raw || "").trim().toLowerCase();
  if (!value) {
    if (kind === "yes") return "Yes";
    if (kind === "no") return "No";
    if (kind === "loop") return "Try again";
    if (kind === "handoff") return "Hand off";
    return "";
  }
  if (value.includes("yes") || value.includes("finish") || value.includes("pr")) {
    return value.length > 18 ? "Yes" : capitalize(raw || "Yes");
  }
  if (
    value.includes("no") ||
    value.includes("retry") ||
    value.includes("diagnose") ||
    value.includes("broken")
  ) {
    return value.length > 18 ? "Try again" : capitalize(raw || "Try again");
  }
  if (value.length > 22) return capitalize(value.slice(0, 20)) + "…";
  return capitalize(raw || "");
}

function capitalize(text: string) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shortenLabel(label: string, max = 56) {
  const cleaned = label.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

export function buildDiagramFromWorkflow(
  workflow: WorkflowModel,
): { nodes: WorkflowDiagramNode[]; edges: WorkflowDiagramEdge[] } {
  const steps = [...workflow.steps].sort((a, b) => a.order - b.order);
  if (steps.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes: WorkflowDiagramNode[] = [
    {
      id: "start",
      label: workflow.name || "Start",
      kind: "start",
      application: "",
      source: "explained",
    },
  ];

  const edges: WorkflowDiagramEdge[] = [];
  let previousId = "start";

  for (const step of steps) {
    nodes.push({
      id: step.id,
      label: step.description,
      kind: "action",
      application: step.application || "",
      source: step.source,
    });
    edges.push({
      id: `e-${previousId}-${step.id}`,
      source: previousId,
      target: step.id,
      label: "",
      kind: "default",
    });
    previousId = step.id;
  }

  for (const decision of workflow.decisionPoints) {
    const decisionId = decision.id || `decision-${nodes.length}`;
    nodes.push({
      id: decisionId,
      label: decision.description,
      kind: "decision",
      application: "",
      source: decision.source,
    });
    edges.push({
      id: `e-${previousId}-${decisionId}`,
      source: previousId,
      target: decisionId,
      label: "",
      kind: "default",
    });

    const options = decision.options?.length
      ? decision.options
      : ["Yes", "Try again"];
    const yes = options[0] ?? "Yes";
    const no = options[1] ?? "Try again";

    edges.push({
      id: `e-${decisionId}-end`,
      source: decisionId,
      target: "end",
      label: yes,
      kind: "yes",
    });

    if (steps[0]) {
      edges.push({
        id: `e-${decisionId}-loop`,
        source: decisionId,
        target: steps[0].id,
        label: no,
        kind: "loop",
      });
    }

    previousId = decisionId;
  }

  nodes.push({
    id: "end",
    label: "Finish",
    kind: "end",
    application: "",
    source: "explained",
  });

  if (!workflow.decisionPoints.length) {
    edges.push({
      id: `e-${previousId}-end`,
      source: previousId,
      target: "end",
      label: "",
      kind: "default",
    });
  }

  return { nodes, edges };
}

export function preferDiagram(
  primary?: { nodes: WorkflowDiagramNode[]; edges: WorkflowDiagramEdge[] },
  fallbackWorkflow?: WorkflowModel | null,
) {
  if (primary?.nodes?.length && primary.edges?.length) {
    return primary;
  }
  if (fallbackWorkflow) {
    return buildDiagramFromWorkflow(fallbackWorkflow);
  }
  return { nodes: [], edges: [] };
}

export function layoutDiagram(diagram: {
  nodes: WorkflowDiagramNode[];
  edges: WorkflowDiagramEdge[];
}): {
  nodes: Node<DiagramFlowNodeData>[];
  edges: Edge[];
  bounds: { width: number; height: number };
} {
  const g = new dagreGraphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: 44,
    ranksep: 76,
    marginx: 24,
    marginy: 24,
  });

  for (const node of diagram.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of diagram.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagreLayout(g);

  const nodes: Node<DiagramFlowNodeData>[] = diagram.nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      type: "workflow",
      position: {
        x: (pos?.x ?? 0) - NODE_WIDTH / 2,
        y: (pos?.y ?? 0) - NODE_HEIGHT / 2,
      },
      data: {
        label: shortenLabel(node.label),
        kind: node.kind,
        kindLabel: KIND_LABELS[node.kind],
        application: node.application || undefined,
        source: node.source,
        sourceLabel: SOURCE_LABELS[node.source],
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const edges: Edge[] = diagram.edges.map((edge) => {
    const isLoop = edge.kind === "loop" || edge.kind === "no";
    const label = friendlyEdgeLabel(edge.label, edge.kind);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: label || undefined,
      type: "smoothstep",
      pathOptions: { borderRadius: 18 },
      animated: isLoop,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: isLoop ? "#d08a4e" : "rgba(23,23,25,0.45)",
      },
      style: {
        stroke: isLoop ? "#e0a469" : "rgba(23,23,25,0.22)",
        strokeWidth: 1.5,
        strokeDasharray: isLoop ? "5 4" : undefined,
      },
      labelStyle: {
        fill: "#6e6e6e",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.02em",
      },
      labelBgStyle: {
        fill: "#ffffff",
        fillOpacity: 1,
      },
      labelBgPadding: [7, 4] as [number, number],
      labelBgBorderRadius: 999,
    };
  });

  const graph = g.graph();

  return {
    nodes,
    edges,
    bounds: {
      width: Math.round(graph?.width ?? 0),
      height: Math.round(graph?.height ?? 0),
    },
  };
}
