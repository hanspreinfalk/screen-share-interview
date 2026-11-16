import { NextResponse } from "next/server";

import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/consultant-prompt";
import type { TranscriptLine } from "@/lib/session-types";
import type { AutomationReport, WorkflowModel } from "@/lib/workflow-model";

type AnalyzeBody = {
  transcript?: TranscriptLine[];
  workflow?: WorkflowModel;
};

const capabilityStatus = {
  type: "string",
  enum: ["verified", "proposed", "unsupported"],
} as const;

const toolRefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "purpose", "status"],
  properties: {
    name: { type: "string" },
    purpose: { type: "string" },
    status: capabilityStatus,
  },
} as const;

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "howYouWorkToday",
    "agentOpportunities",
    "recommendedAgent",
    "stillNeedsToKnow",
  ],
  properties: {
    howYouWorkToday: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "keyObservations", "uncertainties", "diagram"],
      properties: {
        summary: { type: "string" },
        keyObservations: { type: "array", items: { type: "string" } },
        uncertainties: { type: "array", items: { type: "string" } },
        diagram: {
          type: "object",
          additionalProperties: false,
          required: ["nodes", "edges"],
          properties: {
            nodes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "label", "kind", "application", "source"],
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  kind: {
                    type: "string",
                    enum: [
                      "start",
                      "action",
                      "decision",
                      "loop",
                      "end",
                      "handoff",
                    ],
                  },
                  application: {
                    type: "string",
                    description: "Application name, or empty string if none.",
                  },
                  source: {
                    type: "string",
                    enum: ["observed", "explained", "inferred"],
                  },
                },
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "source", "target", "label", "kind"],
                properties: {
                  id: { type: "string" },
                  source: { type: "string" },
                  target: { type: "string" },
                  label: {
                    type: "string",
                    description: "Edge label, or empty string if none.",
                  },
                  kind: {
                    type: "string",
                    enum: ["default", "yes", "no", "loop", "handoff"],
                  },
                },
              },
            },
          },
        },
      },
    },
    agentOpportunities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "rank",
          "name",
          "mission",
          "currentWorkflow",
          "autonomousWorkflow",
          "trigger",
          "tools",
          "reasoning",
          "verification",
          "recovery",
          "humanInvolvement",
          "feasibility",
          "impact",
        ],
        properties: {
          rank: { type: "number" },
          name: { type: "string" },
          mission: { type: "string" },
          currentWorkflow: { type: "string" },
          autonomousWorkflow: { type: "string" },
          trigger: {
            type: "object",
            additionalProperties: false,
            required: ["type", "detail"],
            properties: {
              type: {
                type: "string",
                enum: [
                  "schedule",
                  "webhook",
                  "manual",
                  "event",
                  "continuous",
                  "unknown",
                ],
              },
              detail: { type: "string" },
            },
          },
          tools: { type: "array", items: toolRefSchema },
          reasoning: { type: "array", items: { type: "string" } },
          verification: { type: "array", items: { type: "string" } },
          recovery: { type: "array", items: { type: "string" } },
          humanInvolvement: { type: "array", items: { type: "string" } },
          feasibility: {
            type: "object",
            additionalProperties: false,
            required: [
              "confirmed",
              "needsInvestigation",
              "blockers",
              "overall",
            ],
            properties: {
              confirmed: { type: "array", items: { type: "string" } },
              needsInvestigation: { type: "array", items: { type: "string" } },
              blockers: { type: "array", items: { type: "string" } },
              overall: { type: "string", enum: ["high", "medium", "low"] },
            },
          },
          impact: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "basedOnEvidence", "assumptions"],
            properties: {
              summary: { type: "string" },
              basedOnEvidence: { type: "string" },
              assumptions: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    recommendedAgent: {
      type: "object",
      additionalProperties: false,
      required: [
        "name",
        "why",
        "executionPlan",
        "architecture",
        "integrations",
        "verificationStrategy",
        "recoveryStrategy",
        "humanApprovalStrategy",
        "feasibilityAssessment",
        "environmentConstraints",
      ],
      properties: {
        name: { type: "string" },
        why: { type: "string" },
        executionPlan: { type: "array", items: { type: "string" } },
        architecture: { type: "string" },
        integrations: { type: "array", items: toolRefSchema },
        verificationStrategy: { type: "string" },
        recoveryStrategy: { type: "string" },
        humanApprovalStrategy: { type: "string" },
        feasibilityAssessment: { type: "string" },
        environmentConstraints: { type: "string" },
      },
    },
    stillNeedsToKnow: { type: "array", items: { type: "string" } },
  },
} as const;

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const chunks: string[] = [];
  for (const item of data.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) chunks.push(part.text);
    }
  }
  return chunks.join("\n").trim();
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Set OPENAI_API_KEY in .env.local" },
      { status: 503 },
    );
  }

  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const transcript = body.transcript ?? [];
  const workflow = body.workflow;

  if (!transcript.length && !workflow) {
    return NextResponse.json(
      { error: "Provide transcript and/or workflow findings" },
      { status: 400 },
    );
  }

  const userPayload = {
    transcript,
    workflow,
    constraints: {
      brandAsPacific: true,
      maxAgentOpportunities: 3,
      forbidBasicProductivityTips: true,
      requireOutcomeOwningAgents: true,
      diagramMustShowCurrentWorkflowOnly: true,
      doNotInventIntegrations: true,
      markUnverifiedUnlessConfirmed: true,
      preferVercelWorkflowsForOrchestration: true,
      preferApisOrComposioWhenPossible: true,
      useBrowserAutomationWhenNeededForVerification: true,
      neverAssumeCloudCanAccessLocalhost: true,
    },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        temperature: 0.25,
        instructions: ANALYSIS_SYSTEM_PROMPT,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Produce Pacific's autonomous-agent assessment JSON for this workflow interview.\n\n${JSON.stringify(userPayload, null, 2)}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "pacific_agent_report",
            strict: true,
            schema: REPORT_SCHEMA,
          },
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message ?? "Analysis request failed" },
        { status: response.status },
      );
    }

    const text = extractOutputText(data);
    if (!text) {
      return NextResponse.json(
        { error: "Analysis returned an empty response" },
        { status: 502 },
      );
    }

    const report = JSON.parse(text) as AutomationReport;
    if (report.agentOpportunities?.length > 3) {
      report.agentOpportunities = report.agentOpportunities
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 3);
    }

    return NextResponse.json(
      { report },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json(
      { error: "Failed to generate automation report" },
      { status: 500 },
    );
  }
}
