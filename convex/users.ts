import type { UserIdentity } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

export async function userByTokenIdentifier(
  ctx: QueryCtx | MutationCtx,
  tokenIdentifier: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", tokenIdentifier),
    )
    .unique();
}

export async function userByClerkId(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

export async function upsertUserFromIdentity(
  ctx: MutationCtx,
  identity: UserIdentity,
): Promise<Doc<"users">> {
  const fields = {
    tokenIdentifier: identity.tokenIdentifier,
    clerkId: identity.subject,
    email: identity.email,
    name: identity.name,
    imageUrl: identity.pictureUrl,
  };

  const existing = await userByTokenIdentifier(ctx, identity.tokenIdentifier);
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    const updated = await ctx.db.get(existing._id);
    if (!updated) {
      throw new Error("Failed to reload user after patch");
    }
    return updated;
  }

  const id = await ctx.db.insert("users", fields);
  const created = await ctx.db.get(id);
  if (!created) {
    throw new Error("Failed to load user after insert");
  }
  return created;
}

/** Upsert the signed-in Clerk user into the `users` table. */
export const store = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx): Promise<Id<"users">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const user = await upsertUserFromIdentity(ctx, identity);
    return user._id;
  },
});

/** Return the current user's profile, or null if signed out / not stored yet. */
export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      tokenIdentifier: v.string(),
      clerkId: v.string(),
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    return await userByTokenIdentifier(ctx, identity.tokenIdentifier);
  },
});
