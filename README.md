# kontraszt

A `kontraszt` egy magyar hírportálokat bejáró CLI scraper, amely Playwright + Crawlee segítségével összegyűjti a címlapos headline-okat, majd az adatokat Convex backendbe szinkronizálja. A futás végén opcionálisan webhookot is meghív a `.env.local` fájlban megadott `WEBHOOK_URL`, `WEBHOOK_SECRET` és `WEBHOOK_ID` változók alapján.

## Fontos fájlok

- `scraper/scrape.ts` — a scraper fő belépési pontja
- `convex/schema.ts` — Convex séma
- `convex/headlines.ts` — headline mentéshez és lekérdezéshez tartozó Convex függvények
- `Dockerfile` — a scraper konténerképe
- `docker-compose.yml` — futtatás Docker Compose-szal

## Környezeti változók

A projekt a `.env.local` fájlból olvassa be a beállításokat.

Példa:

```env
CONVEX_URL=http://127.0.0.1:3210
WEBHOOK_URL=https://example.com/webhook
WEBHOOK_SECRET=your-secret
WEBHOOK_ID=kontraszt
```

## Helyes futtatási parancsok

### 1. Convex indítása fejlesztői módban

```sh
vp exec convex dev
```

Ez létrehozza/frissíti a `convex/_generated/*` fájlokat, és beállítja a `CONVEX_URL` értékét.

### 2. Scraper futtatása lokálisan

Összes oldal scrape-elése:

```sh
vp exec tsx scraper/scrape.ts
```

Vagy a package script segítségével:

```sh
vp run scrape
```

### 3. Egy adott oldal scrape-elése

```sh
vp exec tsx scraper/scrape.ts --telex.hu
```

Több oldal egyszerre:

```sh
vp exec tsx scraper/scrape.ts --telex.hu --hvg.hu
```

### 4. Táblák ürítése scrape előtt

```sh
vp exec tsx scraper/scrape.ts --cleartables
```

### 5. Elérhető oldalak listázása

```sh
vp exec tsx scraper/scrape.ts --list-sites
```

### 6. Típusellenőrzés

```sh
vp exec tsc --noEmit -p tsconfig.json
```

## Docker Compose futtatás

Konténer indítása:

```sh
docker compose up -d
```

Scraper futtatása a konténerben:

```sh
docker compose exec scraper pnpm run scrape
```

Egy adott oldal futtatása a konténerben:

```sh
docker compose exec scraper pnpm run scrape -- --telex.hu
```

Konténer leállítása:

```sh
docker compose down
```

## Megjegyzés Dockerhez

Ha a Convex lokálisan fut, Dockerből ne a `127.0.0.1` címet használd, hanem ezt:

```env
CONVEX_URL=http://host.docker.internal:3210
```

A `docker-compose.yml` már tartalmazza a szükséges host mappinget ehhez.
