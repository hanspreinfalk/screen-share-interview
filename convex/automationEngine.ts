import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { computeNextRunAt } from "./lib/schedule";
import {
  executionVerification,
  logLevel,
  stepResult,
  triggerSource,
} from "./lib/validators";
import schema from "./schema";

const executionDoc = schema.doc("executions");
const automationDoc = schema.doc("automations");

/** Create a queued execution, deduping on idempotencyKey. Optionally schedules the runner. */
export const enqueueRun = internalMutation({
  args: {
    automationId: v.id("automations"),
    userId: v.id("users"),
    triggerSource: triggerSource,
    idempotencyKey: v.string(),
    input: v.optional(v.any()),
    composioEventId: v.optional(v.string()),
    scheduleStart: v.optional(v.boolean()),
  },
  returns: v.id("executions"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("executions")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .first();
    if (existing) {
      return existing._id;
    }

    const automation = await ctx.db.get(args.automationId);
    if (!automation) {
      throw new Error("Automation not found");
    }

    const now = Date.now();
    const stepResults = automation.steps.map((step) => ({
      stepId: step.id,
      status: "pending" as const,
      toolSlug: step.toolSlug,
    }));

    const executionId = await ctx.db.insert("executions", {
      automationId: args.automationId,
      userId: args.userId,
      triggerSource: args.triggerSource,
      status: "queued",
      idempotencyKey: args.idempotencyKey,
      input: args.input ?? {},
      logs: [
        {
          at: now,
          level: "info",
          message: `Enqueued via ${args.triggerSource}`,
        },
      ],
      stepResults,
      startedAt: now,
      composioEventId: args.composioEventId,
    });

    if (args.scheduleStart !== false) {
      await ctx.scheduler.runAfter(0, internal.composio.runAutomationSteps, {
        executionId,
      });
    }

    return executionId;
  },
});

export const startRun = internalMutation({
  args: { executionId: v.id("executions") },
  returns: v.union(v.null(), executionDoc),
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) {
      return null;
    }
    if (
      execution.status !== "queued" &&
      execution.status !== "awaiting_approval"
    ) {
      return execution;
    }
    const now = Date.now();
    await ctx.db.patch(args.executionId, {
      status: "running",
      startedAt: execution.status === "queued" ? now : execution.startedAt,
      logs: [
        ...execution.logs,
        { at: now, level: "info", message: "Run started" },
      ],
    });
    await ctx.db.patch(execution.automationId, {
      lastExecutionAt: now,
      lastExecutionStatus: "running",
      updatedAt: now,
    });
    return await ctx.db.get(args.executionId);
  },
});

export const appendLog = internalMutation({
  args: {
    executionId: v.id("executions"),
    level: logLevel,
    message: v.string(),
    data: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) {
      throw new Error("Execution not found");
    }
    const entry = {
      at: Date.now(),
      level: args.level,
      message: args.message,
      ...(args.data !== undefined ? { data: args.data } : {}),
    };
    await ctx.db.patch(args.executionId, {
      logs: [...execution.logs, entry],
    });
    return null;
  },
});

export const completeStep = internalMutation({
  args: {
    executionId: v.id("executions"),
    stepResult: stepResult,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) {
      throw new Error("Execution not found");
    }
    const existing = execution.stepResults.find(
      (s) => s.stepId === args.stepResult.stepId,
    );
    const merged = existing
      ? { ...existing, ...args.stepResult }
      : args.stepResult;
    const stepResults = existing
      ? execution.stepResults.map((s) =>
          s.stepId === args.stepResult.stepId ? merged : s,
        )
      : [...execution.stepResults, merged];

    const patch: Partial<Doc<"executions">> = { stepResults };
    if (args.stepResult.status === "awaiting_approval") {
      patch.status = "awaiting_approval";
    }
    await ctx.db.patch(args.executionId, patch);
    return null;
  },
});

export const finishRun = internalMutation({
  args: {
    executionId: v.id("executions"),
    status: v.union(
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("awaiting_approval"),
    ),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    verification: v.optional(executionVerification),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) {
      throw new Error("Execution not found");
    }
    const now = Date.now();
    const awaiting = args.status === "awaiting_approval";

    await ctx.db.patch(args.executionId, {
      status: args.status,
      // Preserve prior detail when pausing for approval instead of wiping it.
      ...(args.result !== undefined ? { result: args.result } : {}),
      ...(args.error !== undefined ? { error: args.error } : {}),
      ...(args.verification !== undefined
        ? { verification: args.verification }
        : {}),
      ...(awaiting ? {} : { finishedAt: now }),
      logs: [
        ...execution.logs,
        {
          at: now,
          level: args.status === "failed" ? "error" : "info",
          message:
            args.status === "succeeded"
              ? args.verification
                ? args.verification.verified
                  ? "Run finished and verified"
                  : "Run finished but could not be verified"
                : "Run finished"
              : `Run ${args.status.replace(/_/g, " ")}`,
          ...(args.error ? { data: { error: args.error } } : {}),
        },
      ],
    });

    const automation = await ctx.db.get(execution.automationId);
    const verified = args.status === "succeeded" && args.verification?.verified;

    await ctx.db.patch(execution.automationId, {
      lastExecutionAt: now,
      lastExecutionStatus: args.status,
      updatedAt: now,
      ...(verified ? { verifiedAt: now } : {}),
      // A single failed run must not silently un-schedule the automation, so
      // it moves to needs_testing rather than the terminal failed state.
      ...(args.status === "failed" && automation?.status === "active"
        ? { status: "needs_testing" as const }
        : {}),
    });
    return null;
  },
});

/** Approve a paused step and resume the run from exactly that step. */
export const approveStep = internalMutation({
  args: {
    executionId: v.id("executions"),
    stepId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) {
      throw new Error("Execution not found");
    }
    if (execution.status !== "awaiting_approval") {
      throw new Error("This run is not waiting for approval");
    }

    const now = Date.now();
    const stepResults = execution.stepResults.map((result) =>
      result.stepId === args.stepId
        ? { ...result, status: "approved" as const, error: undefined }
        : result,
    );

    await ctx.db.patch(args.executionId, {
      status: "queued",
      finishedAt: undefined,
      stepResults,
      logs: [
        ...execution.logs,
        { at: now, level: "info" as const, message: "Step approved, resuming" },
      ],
    });

    await ctx.scheduler.runAfter(0, internal.composio.runAutomationSteps, {
      executionId: args.executionId,
    });
    return null;
  },
});

export const getExecutionBundle = internalQuery({
  args: { executionId: v.id("executions") },
  returns: v.union(
    v.null(),
    v.object({
      execution: executionDoc,
      automation: automationDoc,
      user: schema.doc("users"),
    }),
  ),
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) {
      return null;
    }
    const automation = await ctx.db.get(execution.automationId);
    const user = await ctx.db.get(execution.userId);
    if (!automation || !user) {
      return null;
    }
    return { execution, automation, user };
  },
});

/** True when the signed-in user owns an automation bound to this trigger. */
export const userOwnsComposioTrigger = internalQuery({
  args: { composioTriggerId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return false;
    const automations = await ctx.db
      .query("automations")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(200);
    return automations.some(
      (automation) =>
        automation.trigger.event?.composioTriggerId === args.composioTriggerId,
    );
  },
});

export const findAutomationForEvent = internalQuery({
  args: {
    clerkId: v.string(),
    composioTriggerId: v.optional(v.string()),
    triggerSlug: v.optional(v.string()),
  },
  returns: v.union(v.null(), automationDoc),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (!user) {
      return null;
    }
    const automations = await ctx.db
      .query("automations")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(100);

    const matches = automations.filter((a) => {
      if (a.status !== "active") return false;
      if (!a.trigger.types.includes("event") || !a.trigger.event) return false;
      if (!a.trigger.event.enabled) return false;
      if (
        args.composioTriggerId &&
        a.trigger.event.composioTriggerId === args.composioTriggerId
      ) {
        return true;
      }
      if (
        args.triggerSlug &&
        a.trigger.event.triggerSlug === args.triggerSlug
      ) {
        return true;
      }
      return false;
    });

    return matches[0] ?? null;
  },
});

/** Cron target: enqueue due scheduled automations and bump nextRunAt. */
export const processDueSchedules = internalMutation({
  args: {},
  returns: v.object({
    processed: v.number(),
    enqueued: v.array(v.id("executions")),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    // Scheduled automations only: `undefined` sorts before all numbers in a
    // Convex index, so an unbounded lte() page would otherwise be consumed by
    // on-demand automations and starve real schedules.
    const due = await ctx.db
      .query("automations")
      .withIndex("by_status_and_nextRunAt", (q) =>
        q.eq("status", "active").gt("nextRunAt", 0).lte("nextRunAt", now),
      )
      .take(100);

    const enqueued: Id<"executions">[] = [];
    let processed = 0;

    for (const automation of due) {
      if (!automation.trigger.types.includes("scheduled")) {
        continue;
      }
      if (!automation.nextRunAt || automation.nextRunAt > now) {
        continue;
      }
      processed += 1;

      const windowKey = Math.floor(automation.nextRunAt / 60_000);
      const idempotencyKey = `scheduled:${automation._id}:${windowKey}`;

      const executionId: Id<"executions"> = await ctx.runMutation(
        internal.automationEngine.enqueueRun,
        {
          automationId: automation._id,
          userId: automation.userId,
          triggerSource: "scheduled",
          idempotencyKey,
          input: { scheduledFor: automation.nextRunAt },
          scheduleStart: true,
        },
      );
      enqueued.push(executionId);

      let nextRunAt: number | undefined;
      if (automation.trigger.schedule) {
        const computed = computeNextRunAt(automation.trigger.schedule, now);
        nextRunAt = computed ?? undefined;
      }
      await ctx.db.patch(automation._id, {
        nextRunAt,
        updatedAt: now,
      });
    }

    return { processed, enqueued };
  },
});
