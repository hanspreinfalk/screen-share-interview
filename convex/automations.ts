import { v } from "convex/values";
import schema from "./schema";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUser, getAuthUserOrNull } from "./lib/auth";
import { computeNextRunAt } from "./lib/schedule";
import {
  approvalPolicy,
  automationInput,
  automationStatus,
  automationStep,
  automationTrigger,
  requiredConnection,
} from "./lib/validators";

const automationDoc = schema.doc("automations");
const executionDoc = schema.doc("executions");

async function requireOwnedAutomation(
  ctx: { db: { get: (id: Id<"automations">) => Promise<Doc<"automations"> | null> } },
  userId: Id<"users">,
  automationId: Id<"automations">,
): Promise<Doc<"automations">> {
  const automation = await ctx.db.get(automationId);
  if (!automation || automation.userId !== userId) {
    throw new Error("Automation not found");
  }
  return automation;
}

/** List the current user's automations (newest first, max 100). */
export const list = query({
  args: {},
  returns: v.array(automationDoc),
  handler: async (ctx) => {
    const user = await getAuthUserOrNull(ctx);
    if (!user) {
      return [];
    }
    return await ctx.db
      .query("automations")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);
  },
});

/** Get one automation by id (ownership required). */
export const get = query({
  args: { id: v.id("automations") },
  returns: v.union(v.null(), automationDoc),
  handler: async (ctx, args) => {
    const user = await getAuthUserOrNull(ctx);
    if (!user) {
      return null;
    }
    const automation = await ctx.db.get(args.id);
    if (!automation || automation.userId !== user._id) {
      return null;
    }
    return automation;
  },
});

/** Create an automation from an interview approval / builder payload. */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    status: v.optional(automationStatus),
    steps: v.array(automationStep),
    requiredToolkits: v.array(v.string()),
    requiredConnections: v.optional(v.array(requiredConnection)),
    inputs: v.optional(v.array(automationInput)),
    expectedOutputs: v.optional(v.array(v.string())),
    businessRules: v.optional(v.array(v.string())),
    exceptions: v.optional(v.array(v.string())),
    verificationCriteria: v.optional(v.array(v.string())),
    trigger: automationTrigger,
    approvalPolicy: v.optional(approvalPolicy),
    interviewId: v.optional(v.id("interviews")),
    workflowSummary: v.optional(v.string()),
  },
  returns: v.id("automations"),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const now = Date.now();

    let nextRunAt: number | undefined;
    if (
      args.trigger.types.includes("scheduled") &&
      args.trigger.schedule
    ) {
      const computed = computeNextRunAt(args.trigger.schedule, now);
      nextRunAt =
        computed ??
        ("nextRunAt" in args.trigger.schedule
          ? args.trigger.schedule.nextRunAt
          : undefined);
    }

    const requiredConnections =
      args.requiredConnections ??
      args.requiredToolkits.map((toolkit) => ({
        toolkit,
        status: "missing" as const,
      }));

    return await ctx.db.insert("automations", {
      userId: user._id,
      name: args.name,
      description: args.description,
      status: args.status ?? "draft",
      version: 1,
      steps: args.steps,
      requiredToolkits: args.requiredToolkits,
      requiredConnections,
      inputs: args.inputs ?? [],
      expectedOutputs: args.expectedOutputs ?? [],
      businessRules: args.businessRules ?? [],
      exceptions: args.exceptions ?? [],
      verificationCriteria: args.verificationCriteria ?? [],
      trigger: args.trigger,
      approvalPolicy: args.approvalPolicy ?? {
        requireBeforeExternalSideEffects: true,
      },
      nextRunAt,
      interviewId: args.interviewId,
      workflowSummary: args.workflowSummary,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Patch fields on an owned automation. */
export const update = mutation({
  args: {
    id: v.id("automations"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    steps: v.optional(v.array(automationStep)),
    requiredToolkits: v.optional(v.array(v.string())),
    requiredConnections: v.optional(v.array(requiredConnection)),
    inputs: v.optional(v.array(automationInput)),
    expectedOutputs: v.optional(v.array(v.string())),
    businessRules: v.optional(v.array(v.string())),
    exceptions: v.optional(v.array(v.string())),
    verificationCriteria: v.optional(v.array(v.string())),
    trigger: v.optional(automationTrigger),
    approvalPolicy: v.optional(approvalPolicy),
    workflowSummary: v.optional(v.string()),
    nextRunAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const existing = await requireOwnedAutomation(ctx, user._id, args.id);
    const cleaned: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(args)) {
      if (key !== "id" && value !== undefined) {
        cleaned[key] = value;
      }
    }
    if (args.trigger?.types.includes("scheduled") && args.trigger.schedule) {
      const computed = computeNextRunAt(args.trigger.schedule, Date.now());
      if (computed !== null) {
        cleaned.nextRunAt = computed;
      }
    }
    await ctx.db.patch(existing._id, cleaned);
    return null;
  },
});

/** Delete an owned automation, its run history, and its event trigger. */
export const remove = mutation({
  args: { id: v.id("automations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const automation = await requireOwnedAutomation(ctx, user._id, args.id);

    // Delete the run history rather than orphaning it in the executions table.
    let deleted = 0;
    while (deleted < 2_000) {
      const batch = await ctx.db
        .query("executions")
        .withIndex("by_automationId", (q) => q.eq("automationId", args.id))
        .take(100);
      if (batch.length === 0) break;
      for (const execution of batch) {
        await ctx.db.delete(execution._id);
      }
      deleted += batch.length;
    }

    // Detach knowledge so it does not point at a deleted automation.
    const related = await ctx.db
      .query("knowledge")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(200);
    for (const snippet of related) {
      if (snippet.relatedAutomationId === args.id) {
        await ctx.db.patch(snippet._id, { relatedAutomationId: undefined });
      }
    }

    // Stop the external webhook so Composio does not keep delivering events.
    const composioTriggerId = automation.trigger.event?.composioTriggerId;
    if (composioTriggerId) {
      await ctx.scheduler.runAfter(
        0,
        internal.composio.disableTriggerInternal,
        { composioTriggerId },
      );
    }

    await ctx.db.delete(args.id);
    return null;
  },
});

/** Enable / disable / pause an owned automation. */
export const setStatus = mutation({
  args: {
    id: v.id("automations"),
    status: automationStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const automation = await requireOwnedAutomation(ctx, user._id, args.id);
    const patch: Partial<Doc<"automations">> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (
      args.status === "active" &&
      automation.trigger.types.includes("scheduled") &&
      automation.trigger.schedule
    ) {
      const next = computeNextRunAt(automation.trigger.schedule, Date.now());
      if (next !== null) {
        patch.nextRunAt = next;
      }
    }

    await ctx.db.patch(automation._id, patch);
    return null;
  },
});

/** Enqueue an on-demand execution for an owned automation. */
export const run = mutation({
  args: {
    id: v.id("automations"),
    input: v.optional(v.any()),
    /** Test runs are tagged so the UI can label them honestly. */
    test: v.optional(v.boolean()),
  },
  returns: v.id("executions"),
  handler: async (ctx, args): Promise<Id<"executions">> => {
    const user = await getAuthUser(ctx);
    await requireOwnedAutomation(ctx, user._id, args.id);
    const source = args.test === true ? "test" : "on_demand";
    const idempotencyKey = `${source}:${args.id}:${user._id}:${Date.now()}`;
    const executionId: Id<"executions"> = await ctx.runMutation(
      internal.automationEngine.enqueueRun,
      {
        automationId: args.id,
        userId: user._id,
        triggerSource: source,
        idempotencyKey,
        input: args.input,
        scheduleStart: true,
      },
    );
    return executionId;
  },
});

/** Approve a step that paused for human review, resuming the run. */
export const approveStep = mutation({
  args: {
    executionId: v.id("executions"),
    stepId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.userId !== user._id) {
      throw new Error("Execution not found");
    }
    await ctx.runMutation(internal.automationEngine.approveStep, {
      executionId: args.executionId,
      stepId: args.stepId,
    });
    return null;
  },
});

/** Update trigger config and recompute nextRunAt for schedules. */
export const configureTrigger = mutation({
  args: {
    id: v.id("automations"),
    trigger: automationTrigger,
    nextRunAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const automation = await requireOwnedAutomation(ctx, user._id, args.id);

    let nextRunAt = args.nextRunAt;
    if (
      nextRunAt === undefined &&
      args.trigger.types.includes("scheduled") &&
      args.trigger.schedule
    ) {
      const computed = computeNextRunAt(args.trigger.schedule, Date.now());
      nextRunAt = computed ?? undefined;
    }

    await ctx.db.patch(automation._id, {
      trigger: args.trigger,
      nextRunAt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** List recent executions for an owned automation. */
export const listExecutions = query({
  args: { automationId: v.id("automations") },
  returns: v.array(executionDoc),
  handler: async (ctx, args) => {
    const user = await getAuthUserOrNull(ctx);
    if (!user) {
      return [];
    }
    const automation = await ctx.db.get(args.automationId);
    if (!automation || automation.userId !== user._id) {
      return [];
    }
    return await ctx.db
      .query("executions")
      .withIndex("by_automationId", (q) =>
        q.eq("automationId", args.automationId),
      )
      .order("desc")
      .take(50);
  },
});

/** Get one execution by id (ownership required). */
export const getExecution = query({
  args: { id: v.id("executions") },
  returns: v.union(v.null(), executionDoc),
  handler: async (ctx, args) => {
    const user = await getAuthUserOrNull(ctx);
    if (!user) {
      return null;
    }
    const execution = await ctx.db.get(args.id);
    if (!execution || execution.userId !== user._id) {
      return null;
    }
    return execution;
  },
});
