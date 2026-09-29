import { setDefaultResultOrder } from "node:dns";
import { PrismaClient } from "../src/generated/prisma";
import { enrichWithWikipedia, type Enrichable } from "./ingest/wikipedia";

// Several Wikimedia hosts are reachable here only over IPv4.
setDefaultResultOrder("ipv4first");

const prisma = new PrismaClient();

/**
 * Re-run only the Wikipedia enrichment pass against rows already in the
 * database.
 *
 * A full seed re-fetches four upstream APIs and takes many minutes; when only
 * the enrichment needs another attempt — after a batch times out, say — this
 * fills the gaps without touching the museum sources.
 */
const main = async () => {
  const rows = await prisma.artwork.findMany({
    where: { wikidataId: { not: null }, interpretation: null },
    select: {
      id: true,
      source: true,
      wikidataId: true,
      interpretation: true,
      interpretationSource: true,
      interpretationUrl: true,
    },
  });

  console.log(`${rows.length} works are missing context. Asking Wikipedia…`);

  await enrichWithWikipedia(rows as Enrichable[]);

  let written = 0;
  for (const row of rows) {
    if (!row.interpretation) continue;

    await prisma.artwork.update({
      where: { id: row.id },
      data: {
        interpretation: row.interpretation,
        interpretationSource: row.interpretationSource,
        interpretationUrl: row.interpretationUrl,
      },
    });
    written += 1;
  }

  const total = await prisma.artwork.count({
    where: { interpretation: { not: null } },
  });

  console.log(`\nUpdated ${written} works. ${total} now carry context.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
