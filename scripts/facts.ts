import { setDefaultResultOrder } from "node:dns";
import { prisma } from "./ingest/persist";
import { fetchWikidataFacts } from "./ingest/wikidata-facts";

// Several Wikimedia hosts are reachable here only over IPv4.
setDefaultResultOrder("ipv4first");

const refreshAll = process.argv.includes("--all");

/**
 * Store Wikidata facts for works with a Wikidata id. Rows that already have
 * facts are skipped unless `--all` is passed, so an interrupted run resumes.
 */
const main = async () => {
  const rows = await prisma.artwork.findMany({
    where: {
      wikidataId: { not: null },
      ...(refreshAll ? {} : { wikidataFacts: null }),
    },
    select: { wikidataId: true },
    distinct: ["wikidataId"],
  });

  const qids = rows
    .map((row) => row.wikidataId)
    .filter((id): id is string => id !== null && /^Q\d+$/.test(id));

  console.log(`Fetching Wikidata facts for ${qids.length} works…`);

  let saved = 0;
  for await (const batch of fetchWikidataFacts(qids)) {
    for (const [qid, facts] of batch) {
      await prisma.artwork.updateMany({
        where: { wikidataId: qid },
        data: { wikidataFacts: JSON.stringify(facts) },
      });
      saved += 1;
    }
    process.stdout.write(`\r  Saved ${saved}/${qids.length}`);
  }

  const missing = await prisma.artwork.count({
    where: { wikidataId: { not: null }, wikidataFacts: null },
  });
  console.log(
    `\nDone. ${missing} works still lack facts${missing ? "; re-run to retry them" : ""}.`,
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
