import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { PlaywrightCrawler, Configuration } from "crawlee";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// -- Load .env.local --------------------------------------------------------

function loadEnvLocal() {
  const envPath = path.resolve(import.meta.dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    const commentIdx = value.indexOf(" #");
    if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

// -- Configuration ----------------------------------------------------------

const CONVEX_URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const CLEAR_BATCH_SIZE = 256;
const SYNC_BATCH_SIZE = 250;

const SITES = [
  { name: "Telex", url: "https://telex.hu" },
  { name: "Origo", url: "https://origo.hu" },
  { name: "Blikk", url: "https://blikk.hu" },
  { name: "24.hu", url: "https://24.hu" },
  { name: "Index", url: "https://index.hu" },
  { name: "BorsOnline", url: "https://borsonline.hu" },
  { name: "444.hu", url: "https://444.hu" },
  { name: "Magyar Nemzet", url: "https://magyarnemzet.hu" },
  { name: "Ripost", url: "https://ripost.hu" },
  { name: "HVG", url: "https://hvg.hu" },
  { name: "ATV", url: "https://atv.hu" },
  { name: "Hirado.hu", url: "https://hirado.hu" },
  { name: "Metropol", url: "https://metropol.hu" },
  { name: "Nepszava", url: "https://nepszava.hu" },
  { name: "Mandiner", url: "https://mandiner.hu" },
  { name: "PestiSracok", url: "https://pestisracok.hu" },
  { name: "Napi", url: "https://napi.hu" },
  { name: "Valasz Online", url: "https://valaszonline.hu" },
  { name: "Vilaggazdasag", url: "https://vg.hu" },
  { name: "Portfolio", url: "https://portfolio.hu" },
  { name: "Magyar Hang", url: "https://hang.hu" },
];

function normalizeSiteToken(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^--?/, "")
    .replace(/^www\./, "")
    .trim();
}

function printHelp() {
  console.log(`Usage:
  vp exec tsx scraper/scrape.ts [options] [--site ...]

Options:
  --help           Show this help
  --list-sites     List available sites and exit
  --debug-scores   Print score breakdowns for top scraped headlines
  --cleartables    Clear headlineDefinitions and headlines before scraping in safe batches

Site filters:
  Pass one or more site filters to scrape only matching sites.
  Accepted forms:
    --telex.hu
    --telex
    --hvg.hu

Examples:
  vp exec tsx scraper/scrape.ts
  vp exec tsx scraper/scrape.ts --telex.hu
  vp exec tsx scraper/scrape.ts --telex.hu --hvg.hu
  vp exec tsx scraper/scrape.ts --cleartables --telex.hu --debug-scores
`);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function clearTablesInBatches(client: ConvexHttpClient) {
  let deletedDefinitions = 0;
  let deletedHeadlines = 0;

  while (true) {
    const result = await client.mutation(api.headlines.clearTableBatch, {
      table: "headlineDefinitions",
      batchSize: CLEAR_BATCH_SIZE,
    });
    deletedDefinitions += result.deletedCount;
    if (result.done) break;
  }

  while (true) {
    const result = await client.mutation(api.headlines.clearTableBatch, {
      table: "headlines",
      batchSize: CLEAR_BATCH_SIZE,
    });
    deletedHeadlines += result.deletedCount;
    if (result.done) break;
  }

  return { deletedDefinitions, deletedHeadlines };
}

function getSelectedSites() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--list-sites")) {
    console.log("Available sites:");
    for (const site of SITES) {
      const hostname = new URL(site.url).hostname.replace(/^www\./, "");
      console.log(`- ${hostname} (${site.name})`);
    }
    process.exit(0);
  }

  const siteArgs = args.filter(
    (arg) =>
      arg.startsWith("--") &&
      arg !== "--help" &&
      arg !== "--list-sites" &&
      arg !== "--debug-scores" &&
      arg !== "--cleartables",
  );
  if (siteArgs.length === 0) return SITES;

  const requested = new Set(siteArgs.map(normalizeSiteToken));
  const selected = SITES.filter((site) => {
    const hostname = new URL(site.url).hostname.replace(/^www\./, "");
    const normalizedName = normalizeSiteToken(site.name);
    return requested.has(hostname) || requested.has(normalizedName);
  });

  if (selected.length === 0) {
    throw new Error(
      `No matching sites for args: ${siteArgs.join(", ")}. Available: ${SITES.map((site) => new URL(site.url).hostname).join(", ")}`,
    );
  }

  return selected;
}

const HEADLINE_SELECTOR = [
  "a[class*='title']",
  "a[class*='headline']",
  "a [class*='article-title']",
  "a [class*='text-heading-4']",
  "a [class*='text-heading-6']",
  "a [class*='text-heading-m']",
  "article h1",
  "article h2",
  "article h3",
  "main h1",
  "main h2",
  "main h3",
  "h1",
  "h2",
  "h3",
].join(", ");

const FALLBACK_SELECTOR = "a";

// -- Types ------------------------------------------------------------------

interface Headline {
  site: string;
  hashedId: string;
  headlineText: string;
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  score: number;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function makeHashedIdFromHref(href: string) {
  return createHash("sha1").update(href.trim()).digest("hex").slice(0, 16);
}

function computeHeadlineScoreBreakdown({
  x,
  y,
  width,
  height,
  fontSize,
  viewportWidth,
  viewportHeight,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  void viewportWidth;
  void viewportHeight;

  const fontWeight = 100;
  const areaWeight = 0.1;
  const yWeight = 6;
  const xWeight = 3.5;
  const topRightWeight = 4;
  const topZoneThreshold = 600;

  const safeX = Math.max(0, x);
  const safeY = Math.max(0, y);
  const area = Math.max(0, width) * Math.max(0, height);
  const topRightDecay = Math.max(0, 1 - safeY / topZoneThreshold);

  const fontContribution = fontWeight * Math.max(0, fontSize);
  const areaContribution = areaWeight * area;
  const yPenalty = yWeight * safeY;
  const xPenalty = xWeight * safeX;
  const topRightPenalty = topRightWeight * safeX * topRightDecay;
  const score = fontContribution + areaContribution - yPenalty - xPenalty - topRightPenalty;

  return {
    fontWeight,
    areaWeight,
    yWeight,
    xWeight,
    topRightWeight,
    topZoneThreshold,
    area: round2(area),
    topRightDecay: round2(topRightDecay),
    fontContribution: round2(fontContribution),
    areaContribution: round2(areaContribution),
    yPenalty: round2(yPenalty),
    xPenalty: round2(xPenalty),
    topRightPenalty: round2(topRightPenalty),
    score: round2(score),
  };
}

function computeHeadlineScore(args: {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  return computeHeadlineScoreBreakdown(args).score;
}

function isLikelyNavigationItem({
  text,
  fontSize,
  x,
  y,
  width,
  height,
  viewportWidth,
  viewportHeight,
}: {
  text: string;
  fontSize: number;
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  const normalizedAscii = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const wordCount = normalized.split(" ").filter(Boolean).length;
  const aspectRatio = width / Math.max(height, 1);
  const isNearTopBar = y < Math.min(140, viewportHeight * 0.18);
  const isRightSide = x > viewportWidth * 0.65;
  const isVeryShort = normalized.length <= 20 || wordCount <= 2;
  const looksLikeSectionLabel =
    /^(hirek|friss|friss hirek|fontos hirek|aktualis|ajanlo|ajanlat|kapcsolodo|kapcsolodo cikkek|kapcsolodo hirek|ez is erdekelheti|tovabbi hirek|legfrissebb|appok|baleset \/ bunugy|szolgaltatas|osszes|temak|nagyvilag|tech \/ mobil|partnerek|gasztro|utazas|belfold|kulfold|gazdasag|uzlet|politika|kozelet|velemeny|sport|foci|eletmod|kultura|tech|tudomany|idojaras|bulvar|video|videok|podcast|podcastek|shorts|menu|kereses|kereso|bejelentkezes|belepes|regisztracio|feliratkozas|hirlevel|hirlevel feliratkozas)$/i.test(
      normalizedAscii,
    );
  const looksLikeUtilityLink =
    /^(facebook|instagram|youtube|twitter|x|tiktok|rss|email|e-mail|app|android|iphone|ios)$/i.test(
      normalizedAscii,
    );
  const looksLikeDateOrMeta =
    /^(ma|tegnap|perce|ora|oraja|ma\s+\d{1,2}:\d{2}|tegnap\s+\d{1,2}:\d{2})$/i.test(
      normalizedAscii,
    );
  const looksLikePromoLabel =
    /^(kiemelt tartalom|tamogatott tartalom|szponzoralt tartalom|ajanljuk|nepszeru|legnepszerubb|most olvassak|most olvassuk|tovabb a cikkre|reszletek|hirlevel feliratkozas|iratkozz fel|feliratkozas a hirlevelre|ajanlott tartalom)$/i.test(
      normalizedAscii,
    );
  const looksLikeVideoPlatformUi =
    /^(shorts|videos|video|playlists|community|channels|about|home|kezdolap)$/i.test(
      normalizedAscii,
    );
  const isAllCapsLabel =
    text === text.toUpperCase() && wordCount <= 3 && normalized.length <= 24 && !/[.!?]/.test(text);
  const isLikelySectionBlock =
    wordCount <= 4 &&
    normalized.length <= 28 &&
    fontSize >= 22 &&
    height <= 48 &&
    width <= viewportWidth * 0.45;
  const isCompactHorizontalItem =
    fontSize <= 18 && height <= 32 && aspectRatio >= 3.5 && isNearTopBar;
  const isTinyTopItem = fontSize <= 16 && width <= 220 && isNearTopBar;
  const isShortTopItem = isNearTopBar && isVeryShort && fontSize <= 20;
  const isTopRightUtilityItem = isNearTopBar && isRightSide && wordCount <= 3;

  return (
    looksLikeSectionLabel ||
    looksLikeUtilityLink ||
    looksLikeDateOrMeta ||
    looksLikePromoLabel ||
    looksLikeVideoPlatformUi ||
    (looksLikeSectionLabel && isLikelySectionBlock) ||
    isCompactHorizontalItem ||
    isTinyTopItem ||
    isShortTopItem ||
    isTopRightUtilityItem ||
    (isAllCapsLabel && isLikelySectionBlock) ||
    (isLikelySectionBlock && (isNearTopBar || y > viewportHeight * 0.6))
  );
}

// -- Scrape a single page using Playwright ----------------------------------

async function scrapePage(page: import("playwright").Page, siteName: string): Promise<Headline[]> {
  const results: Headline[] = [];
  const seen = new Set<string>();

  const { viewportWidth, viewportHeight } = await page.evaluate(() => ({
    viewportWidth: window.innerWidth || document.documentElement.clientWidth || 1,
    viewportHeight: window.innerHeight || document.documentElement.clientHeight || 1,
  }));

  // Try headline selectors first
  let elements = await page.$$(HEADLINE_SELECTOR);

  // Fallback to all links if nothing found
  const useFallback = elements.length === 0;
  if (useFallback) {
    elements = await page.$$(FALLBACK_SELECTOR);
  }

  for (const el of elements) {
    const visible = await el.isVisible().catch(() => false);
    if (!visible) continue;

    const rawText = await el.innerText().catch(() => "");
    const text = rawText.replace(/\s+/g, " ").trim();

    const minLen = useFallback ? 12 : 5;
    if (!text || text.length < minLen) continue;

    const href = await el.evaluate((node) => {
      if (node instanceof HTMLAnchorElement) {
        return node.href || undefined;
      }

      const ancestorAnchor = node.closest("a[href]");
      if (ancestorAnchor instanceof HTMLAnchorElement) {
        return ancestorAnchor.href || undefined;
      }

      const descendantAnchor = node.querySelector?.("a[href]");
      if (descendantAnchor instanceof HTMLAnchorElement) {
        return descendantAnchor.href || undefined;
      }

      const container = node.closest(
        "article, [class*='article'], [class*='card'], [class*='post'], [class*='story']",
      );
      const containerAnchor = container?.querySelector?.("a[href]");
      if (containerAnchor instanceof HTMLAnchorElement) {
        return containerAnchor.href || undefined;
      }

      return undefined;
    });
    if (!href) continue;

    const hashedId = makeHashedIdFromHref(href);
    if (seen.has(hashedId)) continue;

    const box = await el.boundingBox();
    if (!box) continue;

    const fontSizeStr: string = await el.evaluate((node) => window.getComputedStyle(node).fontSize);
    const fontSize = parseFloat(fontSizeStr.replace("px", ""));

    // In fallback mode, skip small font links
    if (useFallback && fontSize < 16) continue;

    if (
      isLikelyNavigationItem({
        text,
        fontSize,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        viewportWidth,
        viewportHeight,
      })
    ) {
      continue;
    }

    seen.add(hashedId);

    const score = computeHeadlineScore({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      fontSize,
      viewportWidth,
      viewportHeight,
    });

    results.push({
      site: siteName,
      hashedId,
      headlineText: text,
      href,
      x: round2(box.x),
      y: round2(box.y),
      width: round2(box.width),
      height: round2(box.height),
      fontSize: round2(fontSize),
      score,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// -- Main -------------------------------------------------------------------

async function main() {
  const client = new ConvexHttpClient(CONVEX_URL);
  const allHeadlines: Headline[] = [];
  const sites = getSelectedSites();
  const showScoreDebug = process.argv.includes("--debug-scores");
  const clearTablesFirst = process.argv.includes("--cleartables");

  if (clearTablesFirst) {
    const result = await clearTablesInBatches(client);
    console.log(
      `Cleared tables: headlineDefinitions=${result.deletedDefinitions}, headlines=${result.deletedHeadlines}`,
    );
  }

  // Disable Crawlee's default storage to avoid writing files to disk
  const config = Configuration.getGlobalConfig();
  config.set("persistStorage", false);

  const crawler = new PlaywrightCrawler(
    {
      headless: true,
      launchContext: {
        launchOptions: {
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
      navigationTimeoutSecs: 30,
      requestHandlerTimeoutSecs: 60,
      maxRequestsPerCrawl: sites.length,
      // Only one browser context, process sites sequentially
      maxConcurrency: 1,

      async requestHandler({ request, page, log }) {
        const siteName = request.userData.siteName as string;
        log.info(`Scraping ${siteName} (${request.url})...`);

        // Wait for content to load
        await page.waitForLoadState("domcontentloaded");
        // Give JS-rendered content a moment
        await page.waitForTimeout(2000);

        const headlines = await scrapePage(page, siteName);
        log.info(`Found ${headlines.length} headlines on ${siteName}`);

        if (showScoreDebug) {
          const { width: viewportWidth, height: viewportHeight } = page.viewportSize() ?? {
            width: 1280,
            height: 720,
          };
          console.log(`\nScore debug for ${siteName}:`);
          for (const h of headlines.slice(0, 15)) {
            const breakdown = computeHeadlineScoreBreakdown({
              x: h.x,
              y: h.y,
              width: h.width,
              height: h.height,
              fontSize: h.fontSize,
              viewportWidth,
              viewportHeight,
            });
            console.log(
              JSON.stringify(
                {
                  site: h.site,
                  headlineText: h.headlineText,
                  x: h.x,
                  y: h.y,
                  width: h.width,
                  height: h.height,
                  fontSize: h.fontSize,
                  ...breakdown,
                },
                null,
                2,
              ),
            );
          }
        }

        let definitionInsertCount = 0;
        let headlineInsertCount = 0;

        for (const chunk of chunkArray(headlines, SYNC_BATCH_SIZE)) {
          const result = await client.mutation(api.headlines.syncSite, {
            site: siteName,
            headlines: chunk.map(({ hashedId, headlineText, href, x, y, width, height, fontSize, score }) => ({
              hashedId,
              headlineText,
              href,
              x,
              y,
              width,
              height,
              fontSize,
              score,
            })),
          });
          definitionInsertCount += result.definitionInsertCount;
          headlineInsertCount += result.headlineInsertCount;
        }
        log.info(
          `  Synced: definitionsInserted=${definitionInsertCount} headlinesInserted=${headlineInsertCount}`,
        );

        allHeadlines.push(...headlines);
      },

      async failedRequestHandler({ request, log }) {
        log.error(`Failed to scrape ${request.url}`);
      },
    },
    config,
  );

  // Enqueue all sites with their names as userData
  await crawler.run(
    sites.map((s) => ({
      url: s.url,
      userData: { siteName: s.name },
    })),
  );

  console.log(`\nDone! Total headlines scraped: ${allHeadlines.length}`);

}

main().catch(console.error);

