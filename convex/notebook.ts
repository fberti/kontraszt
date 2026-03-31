import { paginationOptsValidator } from "convex/server";

import { query } from "./_generated/server";

export const listHeadlines = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("headlines").order("desc").paginate(args.paginationOpts);
  },
});

export const listHeadlineDefinitions = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("headlineDefinitions").paginate(args.paginationOpts);
  },
});
