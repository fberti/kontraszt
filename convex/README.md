# Convex backend

This project uses Convex only as a backend for the CLI scraper in `scraper/scrape.ts`.

Relevant files:

- `convex/schema.ts` defines the headline tables.
- `convex/headlines.ts` syncs scraped headlines into Convex.
- `scraper/scrape.ts` reads `CONVEX_URL` from `.env.local`.

## Development setup

Start or connect to your Convex cloud dev deployment:

```sh
vp run convex
```

This runs `convex dev`, which will generate `convex/_generated/*` and write the deployment URL into `.env.local` as `CONVEX_URL`.

Then run the scraper:

```sh
vp run scrape
```

## Notes

- The scraper now requires `CONVEX_URL` to be set and will fail fast if it is missing.
- To create the deployment URL in `.env.local`, run `vp run convex` (or `npx convex dev`).
