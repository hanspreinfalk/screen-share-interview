import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  approvalPolicy,
  automationInput,
  automationStatus,
  automationStep,
  automationTrigger,
  executionLog,
  executionStatus,
  executionVerification,
  knowledgeKind,
  requiredConnection,
  stepResult,
  triggerSource,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({
    /** Canonical Clerk identity key: `${issuer}|${subject}` */
    tokenIdentifier: v.string(),
    /** Clerk user id (`identity.subject`) */
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"]),

  knowledge: defineTable({
    userId: v.id("users"),
    kind: knowledgeKind,
    title: v.string(),
    content: v.string(),
    relatedAutomationId: v.optional(v.id("automations")),
    confirmedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_kind", ["userId", "kind"]),

  automations: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.string(),
    status: automationStatus,
    version: v.number(),
    steps: v.array(automationStep),
    requiredToolkits: v.array(v.string()),
    requiredConnections: v.array(requiredConnection),
    inputs: v.array(automationInput),
    expectedOutputs: v.array(v.string()),
    businessRules: v.array(v.string()),
    exceptions: v.array(v.string()),
    verificationCriteria: v.array(v.string()),
    trigger: automationTrigger,
    approvalPolicy: approvalPolicy,
    lastExecutionAt: v.optional(v.number()),
    lastExecutionStatus: v.optional(executionStatus),
    /** Set once a real run has been verified end to end. Drives "tested" UI. */
    verifiedAt: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    interviewId: v.optional(v.string()),
    workflowSummary: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_status_and_nextRunAt", ["status", "nextRunAt"]),

  executions: defineTable({
    automationId: v.id("automations"),
    userId: v.id("users"),
    triggerSource: triggerSource,
    status: executionStatus,
    idempotencyKey: v.string(),
    input: v.any(),
    logs: v.array(executionLog),
    stepResults: v.array(stepResult),
    verification: v.optional(executionVerification),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    composioEventId: v.optional(v.string()),
  })
    .index("by_automationId", ["automationId"])
    .index("by_userId", ["userId"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_status", ["status"]),
});
