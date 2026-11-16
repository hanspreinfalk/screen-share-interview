import type {
  AgentDiagram,
  EvidenceSource,
  WorkflowDiagramEdge,
  WorkflowDiagramNode,
} from "@/lib/workflow-model";

/**
 * Progressive interview stage. Only one interactive panel is visible at a time.
 * The voice orb and call controls stay available throughout.
 */
export type InterviewStage =
  | "conversation"
  | "workflow"
  | "automation"
  | "integrations"
  | "readiness";

/** Live diagram Pacific draws and refines during the conversation. */
export type LiveWorkflowDiagram = {
  title: string;
  summary: string;
  nodes: WorkflowDiagramNode[];
  edges: WorkflowDiagramEdge[];
  revision: number;
  confirmation: "pending" | "confirmed" | "needs_fix";
  confirmPrompt: string | null;
};

export type AutomationProposal = {
  id: string;
  name: string;
  outcome: string;
  trigger: string;
  agentSteps: string[];
  humanSteps: string[];
  feasibilityNote: string;
  status: "proposed" | "confirmed" | "rejected";
  /** Composio toolkit slugs when known. */
  toolkits?: string[];
  /** Executable steps with optional tool slugs. */
  steps?: Array<{
    id: string;
    title: string;
    instruction: string;
    toolSlug?: string;
    toolkit?: string;
    requiresApproval: boolean;
  }>;
  triggerTypes?: Array<"on_demand" | "scheduled" | "event">;
};

export type IntegrationRequirement = {
  id: string;
  app: string;
  /** Composio toolkit slug */
  toolkit: string;
  reason: string;
  required: boolean;
  connected: boolean;
  connectedAccountId?: string;
};

/** Honest live state of the real test run, so the UI never implies success. */
export type TestStatus =
  | "running"
  | "passed"
  | "unverified"
  | "failed"
  | "awaiting_approval";

export type AgentReadiness = {
  agentName: string;
  outcome: string;
  trigger: string;
  requiredIntegrations: string[];
  remainingSetup: string[];
  readyToCreate: boolean;
  statusNote: string;
  proposedAgentDiagram?: AgentDiagram | null;
  /** Set after Pacific creates a durable automation in Convex. */
  automationId?: string;
  /** Null until a test run starts. */
  testStatus?: TestStatus | null;
  testSummary?: string | null;
};

export type InterviewArtifacts = {
  stage: InterviewStage;
  liveDiagram: LiveWorkflowDiagram | null;
  stopShareHint: string | null;
  automation: AutomationProposal | null;
  integrations: IntegrationRequirement[];
  readiness: AgentReadiness | null;
};

export function createEmptyInterviewArtifacts(): InterviewArtifacts {
  return {
    stage: "conversation",
    liveDiagram: null,
    stopShareHint: null,
    automation: null,
    integrations: [],
    readiness: null,
  };
}

export function normalizeEvidenceSource(value: unknown): EvidenceSource {
  if (value === "observed" || value === "explained" || value === "inferred") {
    return value;
  }
  return "explained";
}
