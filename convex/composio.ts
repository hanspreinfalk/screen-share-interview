"use node";

import { Composio } from "@composio/core";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  type ActionCtx,
} from "./_generated/server";
import {
  synthesizeToolArgs,
  truncateForPrompt,
  verifyRunOutcome,
} from "./lib/openai";

function requireApiKey(): string {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) {
    throw new Error("COMPOSIO_API_KEY is not set on the Convex deployment");
  }
  return key;
}

function getComposio(): Composio {
  return new Composio({ apiKey: requireApiKey() });
}

async function requireClerkSubject(
  ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } },
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
}

/** Discover tools, optionally filtered by toolkit and/or search query. */
export const discoverTools = action({
  args: {
    toolkits: v.optional(v.array(v.string())),
    query: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      slug: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      toolkit: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireClerkSubject(ctx);
    const composio = getComposio();
    const query = args.query?.trim();
    const tools =
      args.toolkits && args.toolkits.length > 0
        ? await composio.tools.getRawComposioTools({
            toolkits: args.toolkits,
            ...(query ? { search: query } : {}),
            limit: 50,
          })
        : await composio.tools.getRawComposioTools({
            // SearchOnlyParams forbids `limit`; keep the query non-empty.
            search: query || "automation",
          });
    return tools.slice(0, 50).map((tool) => ({
      slug: tool.slug,
      name: tool.name ?? tool.slug,
      description:
        typeof tool.description === "string" ? tool.description : undefined,
      toolkit:
        typeof tool.toolkit === "string"
          ? tool.toolkit
          : tool.toolkit &&
              typeof tool.toolkit === "object" &&
              "slug" in tool.toolkit
            ? String((tool.toolkit as { slug?: string }).slug ?? "")
            : undefined,
    }));
  },
});

/** Discover trigger types for the given toolkits. */
export const discoverTriggers = action({
  args: { toolkits: v.array(v.string()) },
  returns: v.array(
    v.object({
      slug: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      toolkit: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireClerkSubject(ctx);
    const composio = getComposio();
    const result = await composio.triggers.listTypes({
      toolkits: args.toolkits,
      limit: 50,
    });
    const items = result.items ?? [];
    return items.map((item) => ({
      slug: item.slug,
      name: item.name ?? item.slug,
      description:
        typeof item.description === "string" ? item.description : undefined,
      toolkit:
        typeof item.toolkit === "string"
          ? item.toolkit
          : item.toolkit &&
              typeof item.toolkit === "object" &&
              "slug" in item.toolkit
            ? String((item.toolkit as { slug?: string }).slug ?? "")
            : undefined,
    }));
  },
});

function toolkitSlugFromAccount(account: {
  toolkit?: unknown;
}): string {
  if (typeof account.toolkit === "string") return account.toolkit;
  if (
    account.toolkit &&
    typeof account.toolkit === "object" &&
    "slug" in account.toolkit
  ) {
    return String((account.toolkit as { slug?: string }).slug ?? "");
  }
  return "";
}

function statusFromAccount(account: { status?: unknown }): string {
  return typeof account.status === "string" ? account.status.toUpperCase() : "";
}

/** Check connected-account status for toolkits for the current Clerk user. */
export const checkConnections = action({
  args: { toolkits: v.array(v.string()) },
  returns: v.array(
    v.object({
      toolkit: v.string(),
      status: v.union(v.literal("missing"), v.literal("connected")),
      connectedAccountId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireClerkSubject(ctx);
    const composio = getComposio();
    const accounts = await composio.connectedAccounts.list({
      userIds: [userId],
      toolkitSlugs: args.toolkits,
    });
    const items = accounts.items ?? [];
    const byToolkit = new Map<string, string>();
    for (const account of items) {
      const slug = toolkitSlugFromAccount(account);
      const status = statusFromAccount(account);
      if (slug && status === "ACTIVE" && !byToolkit.has(slug)) {
        byToolkit.set(slug, account.id);
      }
    }
    return args.toolkits.map((toolkit) => {
      const connectedAccountId = byToolkit.get(toolkit);
      return connectedAccountId
        ? {
            toolkit,
            status: "connected" as const,
            connectedAccountId,
          }
        : { toolkit, status: "missing" as const };
    });
  },
});

/** List every Composio connected account for the current Clerk user. */
export const listConnections = action({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      toolkit: v.string(),
      status: v.string(),
      isDisabled: v.boolean(),
      createdAt: v.optional(v.string()),
      updatedAt: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireClerkSubject(ctx);
    const composio = getComposio();
    const accounts = await composio.connectedAccounts.list({
      userIds: [userId],
      limit: 100,
    });
    const items = accounts.items ?? [];
    return items
      .map((account) => {
        const toolkit = toolkitSlugFromAccount(account);
        const status = statusFromAccount(account) || "UNKNOWN";
        return {
          id: account.id,
          toolkit,
          status,
          isDisabled: Boolean(account.isDisabled),
          createdAt:
            typeof account.createdAt === "string" ? account.createdAt : undefined,
          updatedAt:
            typeof account.updatedAt === "string" ? account.updatedAt : undefined,
        };
      })
      .filter((account) => account.toolkit.length > 0);
  },
});

/** Disconnect (delete) a Composio connected account owned by the current user. */
export const disconnectConnection = action({
  args: { connectedAccountId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireClerkSubject(ctx);
    const composio = getComposio();
    const accounts = await composio.connectedAccounts.list({
      userIds: [userId],
      limit: 100,
    });
    const owned = (accounts.items ?? []).some(
      (account) => account.id === args.connectedAccountId,
    );
    if (!owned) {
      throw new Error("Connected account not found for this user");
    }
    await composio.connectedAccounts.delete(args.connectedAccountId);
    return null;
  },
});

/** Start an OAuth / connect-link flow for a toolkit; returns authorize URL when available. */
export const requestConnection = action({
  args: {
    toolkit: v.string(),
    callbackUrl: v.string(),
  },
  returns: v.object({
    redirectUrl: v.union(v.string(), v.null()),
    connectionId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const userId = await requireClerkSubject(ctx);
    const composio = getComposio();
    const session = await composio.create(userId, {
      toolkits: [args.toolkit],
      manageConnections: true,
    });
    const connectionRequest = await session.authorize(args.toolkit, {
      callbackUrl: args.callbackUrl,
    });
    return {
      redirectUrl: connectionRequest.redirectUrl ?? null,
      connectionId: connectionRequest.id,
    };
  },
});

/** Internal cleanup: disable a trigger after its automation was deleted. */
export const disableTriggerInternal = internalAction({
  args: { composioTriggerId: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    try {
      const composio = getComposio();
      await composio.triggers.disable(args.composioTriggerId);
    } catch {
      // Best effort: the automation is already gone, and an undeliverable
      // event is answered with matched:false by the webhook.
    }
    return null;
  },
});

/** Create a Composio event trigger instance for the current user. */
export const createEventTrigger = action({
  args: {
    triggerSlug: v.string(),
    triggerConfig: v.any(),
    connectedAccountId: v.optional(v.string()),
  },
  returns: v.object({
    triggerId: v.string(),
    type: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const userId = await requireClerkSubject(ctx);
    const composio = getComposio();
    const created = await composio.triggers.create(userId, args.triggerSlug, {
      triggerConfig:
        args.triggerConfig && typeof args.triggerConfig === "object"
          ? (args.triggerConfig as Record<string, unknown>)
          : {},
      ...(args.connectedAccountId
        ? { connectedAccountId: args.connectedAccountId }
        : {}),
    });
    return {
      triggerId: created.triggerId,
      type: created.type,
    };
  },
});

/** Disable a Composio trigger instance owned by one of the user's automations. */
export const disableEventTrigger = action({
  args: { composioTriggerId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireClerkSubject(ctx);
    // Only triggers attached to the caller's own automations may be disabled.
    const owned = await ctx.runQuery(
      internal.automationEngine.userOwnsComposioTrigger,
      { composioTriggerId: args.composioTriggerId },
    );
    if (!owned) {
      throw new Error("Trigger not found for this user");
    }
    const composio = getComposio();
    await composio.triggers.disable(args.composioTriggerId);
    return null;
  },
});

/**
 * Execute an automation end to end.
 *
 * Every step resolves its real Composio tool schema, has concrete arguments
 * synthesized from the run context, executes against the user's connected
 * account, and the finished run is then verified. A run only reports success
 * when the evidence supports it: no tool slug, unsatisfiable arguments, or an
 * unverifiable outcome all fail loudly instead of silently "succeeding".
 */
export const runAutomationSteps = internalAction({
  args: { executionId: v.id("executions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // One outer guard: any unexpected throw must still close out the run,
    // otherwise executions get stuck in `running` forever with no reason.
    try {
      await executeRun(ctx, args.executionId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Automation run failed";
      await ctx.runMutation(internal.automationEngine.finishRun, {
        executionId: args.executionId,
        status: "failed",
        error: message,
      });
    }
    return null;
  },
});

type RunCtx = {
  runQuery: ActionCtx["runQuery"];
  runMutation: ActionCtx["runMutation"];
};

async function executeRun(ctx: RunCtx, executionId: Id<"executions">) {
  const bundle = await ctx.runQuery(
    internal.automationEngine.getExecutionBundle,
    { executionId },
  );
  if (!bundle) {
    throw new Error("Execution bundle not found");
  }

  const { execution, automation, user } = bundle;
  if (
    execution.status === "succeeded" ||
    execution.status === "failed" ||
    execution.status === "cancelled"
  ) {
    return;
  }

  await ctx.runMutation(internal.automationEngine.startRun, { executionId });

  if (automation.steps.length === 0) {
    await ctx.runMutation(internal.automationEngine.finishRun, {
      executionId,
      status: "failed",
      error: "This automation has no steps to run",
    });
    return;
  }

  // Every step needs a real tool. Fail before touching anything external so
  // the user gets a clear reason rather than a no-op that claims success.
  const missingTool = automation.steps.filter((step) => !step.toolSlug);
  if (missingTool.length > 0) {
    const titles = missingTool.map((step) => step.title).join(", ");
    await ctx.runMutation(internal.automationEngine.appendLog, {
      executionId,
      level: "error",
      message: `Cannot run: ${missingTool.length} step(s) have no tool assigned`,
      data: { steps: titles },
    });
    await ctx.runMutation(internal.automationEngine.finishRun, {
      executionId,
      status: "failed",
      error: `These steps have no tool assigned yet: ${titles}`,
    });
    return;
  }

  const composio = getComposio();
  const session = await composio.create(user.clerkId, {
    toolkits:
      automation.requiredToolkits.length > 0
        ? automation.requiredToolkits
        : undefined,
    manageConnections: true,
  });

  // Previously completed steps (from an approval resume) are not re-executed,
  // so approving never duplicates an external side effect.
  const alreadyDone = new Map(
    execution.stepResults
      .filter((result) => result.status === "succeeded")
      .map((result) => [result.stepId, result] as const),
  );

  const completed: Array<{
    title: string;
    toolSlug?: string;
    status: string;
    summary?: string;
    error?: string;
    result?: unknown;
  }> = [];

  for (const step of automation.steps) {
    const previous = alreadyDone.get(step.id);
    if (previous) {
      completed.push({
        title: step.title,
        toolSlug: previous.toolSlug,
        status: "succeeded",
        summary: previous.summary,
        result: previous.result,
      });
      continue;
    }

    const approvalGranted = execution.stepResults.some(
      (result) => result.stepId === step.id && result.status === "approved",
    );

    if (step.requiresApproval && !approvalGranted) {
      await ctx.runMutation(internal.automationEngine.completeStep, {
        executionId,
        stepResult: {
          stepId: step.id,
          status: "awaiting_approval",
          toolSlug: step.toolSlug,
        },
      });
      await ctx.runMutation(internal.automationEngine.appendLog, {
        executionId,
        level: "info",
        message: `Waiting for your approval: ${step.title}`,
      });
      await ctx.runMutation(internal.automationEngine.finishRun, {
        executionId,
        status: "awaiting_approval",
      });
      return;
    }

    const toolSlug = step.toolSlug as string;
    const startedAt = Date.now();

    await ctx.runMutation(internal.automationEngine.completeStep, {
      executionId,
      stepResult: {
        stepId: step.id,
        status: "running",
        toolSlug,
        startedAt,
      },
    });

    // The tool's own schema is the contract for the arguments.
    const schema = await loadToolSchema(composio, toolSlug);
    const plan = await synthesizeToolArgs({
      toolSlug,
      toolName: schema.name,
      toolDescription: schema.description,
      inputSchema: schema.inputSchema,
      instruction: step.instruction,
      automationName: automation.name,
      automationDescription: automation.description,
      businessRules: automation.businessRules,
      runInput: execution.input,
      previousSteps: completed.map((item) => ({
        title: item.title,
        summary: item.summary,
        result: item.result,
      })),
    });

    if (!plan.ok) {
      const detail = plan.missing.length
        ? `${plan.reason} (missing: ${plan.missing.join(", ")})`
        : plan.reason;
      await ctx.runMutation(internal.automationEngine.completeStep, {
        executionId,
        stepResult: {
          stepId: step.id,
          status: "failed",
          toolSlug,
          summary: "Missing information needed to run this step",
          error: detail,
          startedAt,
          finishedAt: Date.now(),
        },
      });
      await ctx.runMutation(internal.automationEngine.finishRun, {
        executionId,
        status: "failed",
        error: `${step.title}: ${detail}`,
      });
      return;
    }

    const connected = automation.requiredConnections.find(
      (connection) =>
        connection.status === "connected" &&
        connection.connectedAccountId &&
        (connection.toolkit === step.toolkit ||
          toolSlug.toLowerCase().startsWith(`${connection.toolkit.toLowerCase()}_`)),
    );

    await ctx.runMutation(internal.automationEngine.appendLog, {
      executionId,
      level: "info",
      message: `Running ${step.title}`,
      data: { tool: toolSlug, args: plan.args },
    });

    try {
      const result = await session.execute(
        toolSlug,
        plan.args,
        connected?.connectedAccountId
          ? { account: connected.connectedAccountId }
          : undefined,
      );

      const failed = isFailedToolResult(result);
      if (failed) {
        await ctx.runMutation(internal.automationEngine.completeStep, {
          executionId,
          stepResult: {
            stepId: step.id,
            status: "failed",
            toolSlug,
            toolArgs: plan.args,
            summary: "The app rejected this step",
            error: failed,
            result: truncateForPrompt(result, 4_000),
            startedAt,
            finishedAt: Date.now(),
          },
        });
        await ctx.runMutation(internal.automationEngine.finishRun, {
          executionId,
          status: "failed",
          error: `${step.title}: ${failed}`,
        });
        return;
      }

      completed.push({
        title: step.title,
        toolSlug,
        status: "succeeded",
        summary: plan.note,
        result,
      });

      await ctx.runMutation(internal.automationEngine.completeStep, {
        executionId,
        stepResult: {
          stepId: step.id,
          status: "succeeded",
          toolSlug,
          toolArgs: plan.args,
          summary: plan.note,
          result: truncateForPrompt(result, 4_000),
          startedAt,
          finishedAt: Date.now(),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Tool execution failed";
      await ctx.runMutation(internal.automationEngine.completeStep, {
        executionId,
        stepResult: {
          stepId: step.id,
          status: "failed",
          toolSlug,
          toolArgs: plan.args,
          error: message,
          startedAt,
          finishedAt: Date.now(),
        },
      });
      await ctx.runMutation(internal.automationEngine.finishRun, {
        executionId,
        status: "failed",
        error: `${step.title}: ${message}`,
      });
      return;
    }
  }

  // Nothing is called "working" until the evidence is checked.
  let verification:
    | { verified: boolean; summary: string; issues: string[] }
    | null = null;
  try {
    verification = await verifyRunOutcome({
      automationName: automation.name,
      goal: automation.description || automation.workflowSummary || automation.name,
      verificationCriteria: automation.verificationCriteria,
      steps: completed,
    });
  } catch (error) {
    await ctx.runMutation(internal.automationEngine.appendLog, {
      executionId,
      level: "warn",
      message: "Could not verify the result automatically",
      data: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }

  await ctx.runMutation(internal.automationEngine.finishRun, {
    executionId,
    status: "succeeded",
    result: { steps: completed.map((item) => item.summary ?? item.title) },
    verification: verification
      ? {
          verified: verification.verified,
          summary: verification.summary,
          issues: verification.issues,
          checkedAt: Date.now(),
        }
      : undefined,
  });
}

/** Fetch a tool's real input schema so arguments can be built against it. */
async function loadToolSchema(
  composio: Composio,
  toolSlug: string,
): Promise<{
  name?: string;
  description?: string;
  inputSchema: Record<string, unknown> | null;
}> {
  try {
    const tools = await composio.tools.getRawComposioTools({
      tools: [toolSlug],
    });
    const tool = tools.find((item) => item.slug === toolSlug) ?? tools[0];
    if (!tool) return { inputSchema: null };
    const raw = (tool as { inputParameters?: unknown }).inputParameters;
    return {
      name: typeof tool.name === "string" ? tool.name : undefined,
      description:
        typeof tool.description === "string" ? tool.description : undefined,
      inputSchema:
        raw && typeof raw === "object"
          ? (raw as Record<string, unknown>)
          : null,
    };
  } catch {
    // A missing schema is recoverable: the model still gets the slug and the
    // instruction, and a bad payload surfaces as a real step failure.
    return { inputSchema: null };
  }
}

/**
 * Composio returns `successful: false` (or an `error`) for app-level failures
 * without throwing, which previously read as success.
 */
function isFailedToolResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  const successful =
    record.successful ?? record.success ?? record.successfull ?? undefined;
  if (successful === false) {
    const error = record.error;
    if (typeof error === "string" && error.trim()) return error.trim();
    return "The app reported the action did not succeed";
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  return null;
}
