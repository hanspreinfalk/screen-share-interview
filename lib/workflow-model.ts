export type EvidenceSource = "observed" | "explained" | "inferred";

export type WorkflowStep = {
  id: string;
  order: number;
  description: string;
  application?: string;
  inputs?: string[];
  outputs?: string[];
  isManual?: boolean;
  requiresJudgment?: boolean;
  source: EvidenceSource;
};

export type DecisionPoint = {
  id: string;
  description: string;
  options?: string[];
  source: EvidenceSource;
};

export type AutomationOpportunity = {
  id: string;
  title: string;
  rationale: string;
  feasibility?: "high" | "medium" | "low" | "unknown";
  source: EvidenceSource;
};

export type WorkflowModel = {
  name?: string;
  objective?: string;
  applications: string[];
  steps: WorkflowStep[];
  inputs: string[];
  outputs: string[];
  manualActions: string[];
  decisionPoints: DecisionPoint[];
  exceptions: string[];
  frequency?: string;
  approximateTimeSpent?: string;
  peopleInvolved: string[];
  businessRules: string[];
  questions: string[];
  uncertainties: string[];
  opportunities: AutomationOpportunity[];
  observations: Array<{
    id: string;
    text: string;
    source: EvidenceSource;
    at: string;
  }>;
  updatedAt: string;
};

export function createEmptyWorkflowModel(): WorkflowModel {
  return {
    applications: [],
    steps: [],
    inputs: [],
    outputs: [],
    manualActions: [],
    decisionPoints: [],
    exceptions: [],
    peopleInvolved: [],
    businessRules: [],
    questions: [],
    uncertainties: [],
    opportunities: [],
    observations: [],
    updatedAt: "",
  };
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((v) => v?.trim()).filter(Boolean) as string[])];
}

export function mergeWorkflowModel(
  current: WorkflowModel,
  patch: Partial<WorkflowModel>,
): WorkflowModel {
  return {
    ...current,
    ...patch,
    name: patch.name ?? current.name,
    objective: patch.objective ?? current.objective,
    frequency: patch.frequency ?? current.frequency,
    approximateTimeSpent:
      patch.approximateTimeSpent ?? current.approximateTimeSpent,
    applications: uniqueStrings([
      ...current.applications,
      ...(patch.applications ?? []),
    ]),
    steps: patch.steps?.length ? patch.steps : current.steps,
    inputs: uniqueStrings([...current.inputs, ...(patch.inputs ?? [])]),
    outputs: uniqueStrings([...current.outputs, ...(patch.outputs ?? [])]),
    manualActions: uniqueStrings([
      ...current.manualActions,
      ...(patch.manualActions ?? []),
    ]),
    decisionPoints: patch.decisionPoints?.length
      ? patch.decisionPoints
      : current.decisionPoints,
    exceptions: uniqueStrings([
      ...current.exceptions,
      ...(patch.exceptions ?? []),
    ]),
    peopleInvolved: uniqueStrings([
      ...current.peopleInvolved,
      ...(patch.peopleInvolved ?? []),
    ]),
    businessRules: uniqueStrings([
      ...current.businessRules,
      ...(patch.businessRules ?? []),
    ]),
    questions: uniqueStrings([
      ...current.questions,
      ...(patch.questions ?? []),
    ]),
    uncertainties: uniqueStrings([
      ...current.uncertainties,
      ...(patch.uncertainties ?? []),
    ]),
    opportunities: patch.opportunities?.length
      ? patch.opportunities
      : current.opportunities,
    observations: [
      ...current.observations,
      ...(patch.observations ?? []),
    ].slice(-80),
    updatedAt: new Date().toISOString(),
  };
}

export type CapabilityStatus = "verified" | "proposed" | "unsupported";

export type WorkflowDiagramNode = {
  id: string;
  label: string;
  kind: "start" | "action" | "decision" | "loop" | "end" | "handoff";
  application?: string;
  source: EvidenceSource;
};

export type WorkflowDiagramEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind?: "default" | "yes" | "no" | "loop" | "handoff";
};

export type AgentToolRef = {
  name: string;
  purpose: string;
  status: CapabilityStatus;
};

export type AgentOpportunity = {
  rank: number;
  name: string;
  mission: string;
  currentWorkflow: string;
  autonomousWorkflow: string;
  trigger: {
    type: "schedule" | "webhook" | "manual" | "event" | "continuous" | "unknown";
    detail: string;
  };
  tools: AgentToolRef[];
  reasoning: string[];
  verification: string[];
  recovery: string[];
  humanInvolvement: string[];
  feasibility: {
    confirmed: string[];
    needsInvestigation: string[];
    blockers: string[];
    overall: "high" | "medium" | "low";
  };
  impact: {
    summary: string;
    basedOnEvidence: string;
    assumptions: string[];
  };
};

export type AutomationReport = {
  howYouWorkToday: {
    summary: string;
    keyObservations: string[];
    uncertainties: string[];
    diagram: {
      nodes: WorkflowDiagramNode[];
      edges: WorkflowDiagramEdge[];
    };
  };
  agentOpportunities: AgentOpportunity[];
  recommendedAgent: {
    name: string;
    why: string;
    executionPlan: string[];
    architecture: string;
    integrations: AgentToolRef[];
    verificationStrategy: string;
    recoveryStrategy: string;
    humanApprovalStrategy: string;
    feasibilityAssessment: string;
    environmentConstraints: string;
  };
  stillNeedsToKnow: string[];
};
