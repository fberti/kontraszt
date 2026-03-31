import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  headlineDefinitions: defineTable({
    hashedId: v.string(),
    siteName: v.optional(v.string()),
    headlineText: v.string(),
    href: v.string(),
  }).index("by_hashedId", ["hashedId"]),

  headlines: defineTable({
    hashedId: v.string(),
    score: v.number(),
    fontSize: v.number(),
    width: v.number(),
    height: v.number(),
    x: v.number(),
    y: v.number(),
    scrapedAt: v.number(),
  })
    .index("by_hashedId", ["hashedId"])
    .index("by_scrapedAt", ["scrapedAt"])
    .index("by_hashedId_and_scrapedAt", ["hashedId", "scrapedAt"]),
});
