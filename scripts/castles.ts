import { setDefaultResultOrder } from "node:dns";
import { fetchCastles } from "./ingest/castles";
import { deduplicateSlugs, persist, prisma } from "./ingest/persist";
import { enrichWithWikipedia } from "./ingest/wikipedia";

// Several Wikimedia hosts are reachable here only over IPv4.
setDefaultResultOrder("ipv4first");

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const requestedLimit = limitArg ? Number(limitArg.slice("--limit=".length)) : NaN;
const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 300;

const main = async () => {
  const castles = await fetchCastles(limit);
  if (castles.length === 0) {
    throw new Error("Wikidata returned no castles; database was not changed.");
  }

  console.log("Adding context from Wikipedia…");
  await enrichWithWikipedia(castles);

  await persist(deduplicateSlugs(castles));

  // UNESCO-listed castles also arrive as monuments; keep only the castle record.
  const { count } = await prisma.artwork.deleteMany({
    where: { source: "wikidata", sourceId: { in: castles.map((castle) => castle.sourceId) } },
  });
  if (count > 0) console.log(`  Merged ${count} monuments into the castles collection`);

  const total = await prisma.artwork.count({ where: { source: "castles" } });
  console.log(`Castles of Europe now holds ${total} castles.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
