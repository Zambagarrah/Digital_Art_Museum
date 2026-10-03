import { fetchCleveland } from "./ingest/cleveland";
import { deduplicateSlugs, persist, prisma } from "./ingest/persist";

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const requestedLimit = limitArg ? Number(limitArg.slice("--limit=".length)) : NaN;
const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 4000;

const main = async () => {
  const works = deduplicateSlugs(await fetchCleveland(limit));
  if (works.length === 0) {
    throw new Error("Cleveland returned no records; database was not changed.");
  }

  await persist(works);

  const counts = await prisma.artwork.groupBy({
    by: ["category"],
    where: { source: "cleveland" },
    _count: { _all: true },
  });
  console.log("Cleveland catalogue now holds:");
  for (const row of counts) {
    console.log(`  ${row.category.padEnd(10)} ${row._count._all}`);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());