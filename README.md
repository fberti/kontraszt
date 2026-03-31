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

### 1. Set `CONVEX_URL`

Before starting the container, make sure `CONVEX_URL` is available to Docker Compose.

Example:

```sh
export CONVEX_URL=https://your-deployment.convex.cloud
```

If you use a local Convex backend, use:

```sh
export CONVEX_URL=http://host.docker.internal:3210
```

You can also put `CONVEX_URL=...` into a local Compose `.env` file if you prefer.

### 2. Build and start the container

```sh
docker compose up -d
```

### 3. Run the scraper inside the running container

The Docker image installs `vp`, so the same package scripts work both locally and in Docker.

Scrape all sites:

```sh
docker compose exec scraper pnpm run scrape
```

Scrape one site:

```sh
docker compose exec scraper pnpm run scrape -- --telex.hu
```

Scrape multiple sites:

```sh
docker compose exec scraper pnpm run scrape -- --telex.hu --hvg.hu
```

Clear tables before scraping:

```sh
docker compose exec scraper pnpm run scrape -- --cleartables
```

List available sites:

```sh
docker compose exec scraper pnpm run scrape -- --list-sites
```

### 4. Stop the container

```sh
docker compose down
```

## Docker / Convex note

Inside Docker, `127.0.0.1` points to the container itself, not your host machine.

So if your Convex backend runs locally, use:

```env
CONVEX_URL=http://host.docker.internal:3210
```

The included `docker-compose.yml` already adds:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

which is needed for this host mapping.

For cloud deployments such as Coolify, do not rely on `.env.local` from your laptop. Instead, set `CONVEX_URL` in the deployment platform's environment-variable settings.

## Notes

- `.env.local` is not baked into the image.
- `docker-compose.yml` reads `CONVEX_URL` from the environment via `${CONVEX_URL}`.
- Locally, you can provide that via `export CONVEX_URL=...` or a local Compose `.env` file.
- In Coolify, set `CONVEX_URL` in the Coolify environment-variable UI.
- The Docker image installs `vp` so `pnpm run scrape` behaves the same way inside and outside the container.
- The container is intentionally long-running so you can execute scraper commands with `docker compose exec`.
