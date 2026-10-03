import { setDefaultResultOrder } from "node:dns";
import { fetchArtInstitute } from "./ingest/art-institute";
import { fetchCastles } from "./ingest/castles";
import { fetchCleveland } from "./ingest/cleveland";
import { fetchMarketSales } from "./ingest/market";
import { fetchMasterpieces } from "./ingest/masterpieces";
import { fetchMet } from "./ingest/met";
import { fetchMonuments } from "./ingest/wikidata";
import { enrichWithWikipedia } from "./ingest/wikipedia";
import { deduplicateSlugs, persist, prisma } from "./ingest/persist";
import { attachRecordedSales, sleep } from "./ingest/shared";

// Node resolves AAAA records first, but several Wikimedia hosts are reachable
// here only over IPv4 — without this every request to them fails with
// ENETUNREACH, which the fetch retry loop would silently swallow.
setDefaultResultOrder("ipv4first");

/** Spacing between Wikidata Query Service calls; it allows 1 request/minute. */
const WDQS_GAP_MS = 65_000;

/** Read `--flag=value` style arguments with a fallback. */
const numericArg = (name: string, fallback: number): number => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  const value = raw ? Number(raw.split("=")[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const main = async () => {
  const aicLimit = numericArg("aic", 3000);
  const metLimit = numericArg("met", 1500);
  const clevelandLimit = numericArg("cleveland", 4000);
  const monumentLimit = numericArg("monuments", 400);
  const marketLimit = numericArg("market", 200);
  const masterpieceLimit = numericArg("masterpieces", 400);
  const castleLimit = numericArg("castles", 300);

  console.log("Fetching from public museum APIs…");

  // The museum APIs are independent hosts, so they can run together.
  const [aic, met, cleveland] = await Promise.all([
    fetchArtInstitute(aicLimit),
    fetchMet(metLimit),
    fetchCleveland(clevelandLimit),
  ]);

  // The Wikidata queries all hit one endpoint, which rate-limits hard
  // (1 request/minute during a service outage). Running them concurrently
  // makes most of them fail, so they are serialised and spaced instead.
  const monuments = await fetchMonuments(monumentLimit);
  await sleep(WDQS_GAP_MS);
  const market = await fetchMarketSales(marketLimit);
  await sleep(WDQS_GAP_MS);
  const masterpieces = await fetchMasterpieces(masterpieceLimit);
  await sleep(WDQS_GAP_MS);
  const castles = await fetchCastles(castleLimit);

  // UNESCO-listed castles also arrive as monuments; keep only the castle record.
  const castleIds = new Set(castles.map((castle) => castle.sourceId));
  const sites = monuments.filter((site) => !castleIds.has(site.sourceId));

  const works = deduplicateSlugs(attachRecordedSales([
    ...aic,
    ...met,
    ...cleveland,
    ...sites,
    ...market,
    ...masterpieces,
    ...castles,
  ], market));

  for (const [name, rows] of [
    ["art institute", aic],
    ["met", met],
    ["cleveland", cleveland],
    ["monuments", sites],
    ["market sales", market],
    ["masterpieces", masterpieces],
    ["castles", castles],
  ] as const) {
    console.log(`  ${name.padEnd(14)} ${rows.length}`);
  }

  console.log("\nAdding context from Wikipedia…");
  await enrichWithWikipedia(works);

  console.log(`\nNormalised ${works.length} objects. Writing to the database…`);

  await persist(works);

  const byCategory = await prisma.artwork.groupBy({
    by: ["category"],
    _count: { _all: true },
  });

  const [interpreted, priced, provenanced] = await Promise.all([
    prisma.artwork.count({ where: { interpretation: { not: null } } }),
    prisma.artwork.count({ where: { salePrice: { not: null } } }),
    prisma.artwork.count({ where: { provenance: { not: null } } }),
  ]);

  console.log("\nCatalogue now holds:");
  for (const row of byCategory) {
    console.log(`  ${row.category.padEnd(10)} ${row._count._all}`);
  }

  console.log("\nEnrichment:");
  console.log(`  interpretation  ${interpreted}`);
  console.log(`  provenance      ${provenanced}`);
  console.log(`  recorded sale   ${priced}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
