import type { UserIdentity } from "convex/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { upsertUserFromIdentity, userByTokenIdentifier } from "../users";

/** Return the signed-in user document, or null when unauthenticated / not stored. */
export async function getAuthUserOrNull(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  return await userByTokenIdentifier(ctx, identity.tokenIdentifier);
}

/**
 * Require auth and upsert the Clerk identity into `users` when missing.
 * Use from mutations (needs write access).
 */
export async function getAuthUser(ctx: MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return await upsertUserFromIdentity(ctx, identity as UserIdentity);
}
