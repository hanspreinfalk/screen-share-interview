import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
});
