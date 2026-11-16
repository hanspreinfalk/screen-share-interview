import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUser, getAuthUserOrNull } from "./lib/auth";
import { knowledgeKind } from "./lib/validators";
import schema from "./schema";

const knowledgeDoc = schema.doc("knowledge");

/** List recent confirmed knowledge for the signed-in user. */
export const list = query({
  args: {
    kind: v.optional(knowledgeKind),
    limit: v.optional(v.number()),
  },
  returns: v.array(knowledgeDoc),
  handler: async (ctx, args) => {
    const user = await getAuthUserOrNull(ctx);
    if (!user) return [];
    const limit = Math.min(Math.max(args.limit ?? 40, 1), 100);
    if (args.kind) {
      return await ctx.db
        .query("knowledge")
        .withIndex("by_userId_and_kind", (q) =>
          q.eq("userId", user._id).eq("kind", args.kind!),
        )
        .order("desc")
        .take(limit);
    }
    return await ctx.db
      .query("knowledge")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);
  },
});

/** Persist a confirmed learning for future interviews. */
export const remember = mutation({
  args: {
    kind: knowledgeKind,
    title: v.string(),
    content: v.string(),
    relatedAutomationId: v.optional(v.id("automations")),
  },
  returns: v.id("knowledge"),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    // Never store a cross-tenant reference.
    if (args.relatedAutomationId) {
      const automation = await ctx.db.get(args.relatedAutomationId);
      if (!automation || automation.userId !== user._id) {
        throw new Error("Automation not found");
      }
    }

    return await ctx.db.insert("knowledge", {
      userId: user._id,
      kind: args.kind,
      title: args.title,
      content: args.content,
      relatedAutomationId: args.relatedAutomationId,
      confirmedAt: Date.now(),
    });
  },
});
