import { v } from "convex/values";

export const knowledgeKind = v.union(
  v.literal("workflow"),
  v.literal("rule"),
  v.literal("correction"),
  v.literal("app_relationship"),
  v.literal("note"),
);

export const automationStatus = v.union(
  v.literal("draft"),
  v.literal("needs_testing"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("failed"),
);

export const automationStep = v.object({
  id: v.string(),
  title: v.string(),
  instruction: v.string(),
  toolSlug: v.optional(v.string()),
  toolkit: v.optional(v.string()),
  requiresApproval: v.boolean(),
});

export const connectionStatus = v.union(
  v.literal("missing"),
  v.literal("connected"),
);

export const requiredConnection = v.object({
  toolkit: v.string(),
  status: connectionStatus,
  connectedAccountId: v.optional(v.string()),
});

export const inputType = v.union(
  v.literal("string"),
  v.literal("number"),
  v.literal("boolean"),
  v.literal("json"),
);

export const automationInput = v.object({
  key: v.string(),
  label: v.string(),
  type: inputType,
  required: v.boolean(),
  defaultValue: v.optional(v.any()),
});

export const triggerType = v.union(
  v.literal("on_demand"),
  v.literal("scheduled"),
  v.literal("event"),
);

export const scheduleFrequency = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("custom"),
);

export const cronSchedule = v.object({
  cron: v.string(),
  timezone: v.string(),
  nextRunAt: v.optional(v.number()),
});

export const frequencySchedule = v.object({
  frequency: scheduleFrequency,
  timeLocal: v.string(),
  daysOfWeek: v.optional(v.array(v.number())),
  dayOfMonth: v.optional(v.number()),
  timezone: v.string(),
  nextRunAt: v.optional(v.number()),
  cron: v.optional(v.string()),
});

export const triggerSchedule = v.union(cronSchedule, frequencySchedule);

export const triggerEvent = v.object({
  triggerSlug: v.string(),
  toolkit: v.string(),
  triggerConfig: v.any(),
  composioTriggerId: v.optional(v.string()),
  enabled: v.boolean(),
});

export const automationTrigger = v.object({
  types: v.array(triggerType),
  schedule: v.optional(triggerSchedule),
  event: v.optional(triggerEvent),
});

export const approvalPolicy = v.object({
  requireBeforeExternalSideEffects: v.boolean(),
  notes: v.optional(v.string()),
});

export const triggerSource = v.union(
  v.literal("on_demand"),
  v.literal("scheduled"),
  v.literal("event"),
  v.literal("test"),
);

export const executionStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("awaiting_approval"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const logLevel = v.union(
  v.literal("debug"),
  v.literal("info"),
  v.literal("warn"),
  v.literal("error"),
);

export const executionLog = v.object({
  at: v.number(),
  level: logLevel,
  message: v.string(),
  data: v.optional(v.any()),
});

export const stepResultStatus = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("skipped"),
  v.literal("awaiting_approval"),
  /** A human approved this step; the next run resumes here. */
  v.literal("approved"),
);

export const stepResult = v.object({
  stepId: v.string(),
  status: stepResultStatus,
  toolSlug: v.optional(v.string()),
  /** Structured payload actually sent to the Composio tool. */
  toolArgs: v.optional(v.any()),
  /** One-line plain-language outcome for the UI. */
  summary: v.optional(v.string()),
  result: v.optional(v.any()),
  error: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
});

/**
 * Honest verdict on whether a run genuinely achieved the automation's goal.
 * `verified` is only true when the evidence in stepResults supports it.
 */
export const executionVerification = v.object({
  verified: v.boolean(),
  summary: v.string(),
  issues: v.array(v.string()),
  checkedAt: v.number(),
});
