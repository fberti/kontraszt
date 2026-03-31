# kontraszt

CLI scraper backed by Convex.

## Relevant files

- `scraper/scrape.ts` — Playwright/Crawlee scraper
- `convex/schema.ts` — Convex schema
- `convex/headlines.ts` — Convex sync mutations/queries
- `Dockerfile` — container image for the scraper
- `docker-compose.yml` — long-running Docker Compose service

## Convex setup

Start or connect to your Convex deployment:

```sh
vp run convex
```

This runs `convex dev`, generates `convex/_generated/*`, and writes `CONVEX_URL` into `.env.local`.

## Local run

Run the scraper directly on your machine:

```sh
vp run scrape
```

## Docker Compose

The project includes a long-running scraper container.

### 1. Build and start the container

```sh
docker compose up -d
```

### 2. Run the scraper inside the running container

Scrape all sites:

```sh
docker compose exec scraper pnpm run scrape:direct
```

Scrape one site:

```sh
docker compose exec scraper pnpm run scrape:direct -- --telex.hu
```

Scrape multiple sites:

```sh
docker compose exec scraper pnpm run scrape:direct -- --telex.hu --hvg.hu
```

Clear tables before scraping:

```sh
docker compose exec scraper pnpm run scrape:direct -- --cleartables
```

List available sites:

```sh
docker compose exec scraper pnpm run scrape:direct -- --list-sites
```

### 3. Stop the container

```sh
docker compose down
```

## Docker / Convex note

If `.env.local` contains a local Convex URL like:

```env
CONVEX_URL=http://127.0.0.1:3210
```

then when running inside Docker, use:

```env
CONVEX_URL=http://host.docker.internal:3210
```

because inside the container, `127.0.0.1` points to the container itself.

The included `docker-compose.yml` already adds:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

which is needed for this host mapping.

## Notes

- `.env.local` is not baked into the image.
- Runtime environment variables are loaded via `docker-compose.yml` using `env_file: .env.local`.
- The container is intentionally long-running so you can execute scraper commands with `docker compose exec`.
