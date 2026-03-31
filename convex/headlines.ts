import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const headlineValidator = v.object({
  hashedId: v.string(),
  headlineText: v.string(),
  href: v.string(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  fontSize: v.number(),
  score: v.number(),
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const rows = await ctx.db
      .query("headlines")
      .withIndex("by_scrapedAt")
      .order("desc")
      .take(limit);

    const definitions = await Promise.all(
      rows.map((row) =>
        ctx.db
          .query("headlineDefinitions")
          .withIndex("by_hashedId", (q) => q.eq("hashedId", row.hashedId))
          .unique(),
      ),
    );

    return rows.map((row, index) => ({
      ...row,
      siteName: definitions[index]?.siteName ?? null,
      headlineText: definitions[index]?.headlineText ?? null,
      href: definitions[index]?.href ?? null,
    }));
  },
});

export const clearTableBatch = mutation({
  args: {
    table: v.union(v.literal("headlineDefinitions"), v.literal("headlines")),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.min(args.batchSize ?? 256, 1000);
    const batch = await ctx.db.query(args.table).take(batchSize);

    for (const doc of batch) {
      await ctx.db.delete(doc._id);
    }

    return {
      table: args.table,
      deletedCount: batch.length,
      done: batch.length < batchSize,
    };
  },
});

export const syncSite = mutation({
  args: {
    site: v.string(),
    headlines: v.array(headlineValidator),
  },
  handler: async (ctx, args) => {
    const scrapedAt = Date.now();

    let definitionInsertCount = 0;
    let headlineInsertCount = 0;

    for (const headline of args.headlines) {
      const existingDefinition = await ctx.db
        .query("headlineDefinitions")
        .withIndex("by_hashedId", (q) => q.eq("hashedId", headline.hashedId))
        .unique();

      if (!existingDefinition) {
        await ctx.db.insert("headlineDefinitions", {
          hashedId: headline.hashedId,
          siteName: args.site,
          headlineText: headline.headlineText,
          href: headline.href,
        });
        definitionInsertCount += 1;
      } else if (
        existingDefinition.siteName !== args.site ||
        existingDefinition.headlineText !== headline.headlineText ||
        existingDefinition.href !== headline.href
      ) {
        await ctx.db.patch(existingDefinition._id, {
          siteName: args.site,
          headlineText: headline.headlineText,
          href: headline.href,
        });
      }

      await ctx.db.insert("headlines", {
        hashedId: headline.hashedId,
        score: headline.score,
        fontSize: headline.fontSize,
        width: headline.width,
        height: headline.height,
        x: headline.x,
        y: headline.y,
        scrapedAt,
      });
      headlineInsertCount += 1;
    }

    return {
      site: args.site,
      scrapedAt,
      definitionInsertCount,
      headlineInsertCount,
    };
  },
});
