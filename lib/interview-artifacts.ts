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
};

export type IntegrationRequirement = {
  id: string;
  app: string;
  reason: string;
  required: boolean;
  connected: boolean;
};

export type AgentReadiness = {
  agentName: string;
  outcome: string;
  trigger: string;
  requiredIntegrations: string[];
  remainingSetup: string[];
  readyToCreate: boolean;
  statusNote: string;
  proposedAgentDiagram?: AgentDiagram | null;
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
