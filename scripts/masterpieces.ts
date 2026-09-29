import { setDefaultResultOrder } from "node:dns";
import { fetchMasterpieces } from "./ingest/masterpieces";
import { deduplicateSlugs, persist, prisma } from "./ingest/persist";
import { enrichWithWikipedia } from "./ingest/wikipedia";

// Several Wikimedia hosts are reachable here only over IPv4.
setDefaultResultOrder("ipv4first");

/**
 * Ingest only the canonical-paintings source.
 *
 * The Wikidata Query Service rate-limits to roughly one request a minute when
 * it is under strain, and a full seed makes three separate calls to it — so
 * this source is the one most likely to come back empty. Re-running it alone
 * takes a minute instead of re-fetching every museum API.
 */
const main = async () => {
  const raw = process.argv.find((arg) => arg.startsWith("--limit="));
  const parsed = raw ? Number(raw.split("=")[1]) : NaN;
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 400;

  console.log(`Asking Wikidata for the ${limit} most widely documented works…`);

  const works = deduplicateSlugs(await fetchMasterpieces(limit));

  if (!works.length) {
    console.error("No works returned — leaving the catalogue untouched.");
    process.exitCode = 1;
    return;
  }

  console.log(`  Fetched ${works.length}`);

  console.log("\nAdding context from Wikipedia…");
  await enrichWithWikipedia(works);

  console.log("\nWriting to the database…");
  await persist(works);

  const total = await prisma.artwork.count({ where: { source: "masterpieces" } });
  console.log(`\nCatalogue holds ${total} canonical works.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
