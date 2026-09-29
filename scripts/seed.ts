import { setDefaultResultOrder } from "node:dns";
import { PrismaClient } from "../src/generated/prisma";
import { slugify } from "../src/lib/artwork";
import { fetchArtInstitute } from "./ingest/art-institute";
import { fetchMarketSales } from "./ingest/market";
import { fetchMet } from "./ingest/met";
import { fetchMonuments } from "./ingest/wikidata";
import { enrichWithWikipedia } from "./ingest/wikipedia";
import type { NormalisedArtwork } from "./ingest/shared";

// Node resolves AAAA records first, but several Wikimedia hosts are reachable
// here only over IPv4 — without this every request to them fails with
// ENETUNREACH, which the fetch retry loop would silently swallow.
setDefaultResultOrder("ipv4first");

const prisma = new PrismaClient();

/** Read `--flag=value` style arguments with a fallback. */
const numericArg = (name: string, fallback: number): number => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  const value = raw ? Number(raw.split("=")[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** Ensure artwork slugs are unique before they reach the unique index. */
const deduplicateSlugs = (works: NormalisedArtwork[]): NormalisedArtwork[] => {
  const seen = new Map<string, number>();

  return works.map((work) => {
    const count = seen.get(work.slug) ?? 0;
    seen.set(work.slug, count + 1);
    return count === 0 ? work : { ...work, slug: `${work.slug}-${count + 1}` };
  });
};

/** Upsert the artists referenced by the batch and return a name -> id lookup. */
const upsertArtists = async (works: NormalisedArtwork[]) => {
  const names = [...new Set(works.map((w) => w.artistName).filter((n): n is string => Boolean(n)))];
  const lookup = new Map<string, string>();

  for (const name of names) {
    const artist = await prisma.artist.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { slug: slugify(name), name, sortName: name },
      select: { id: true },
    });
    lookup.set(name, artist.id);
  }

  console.log(`  Linked ${lookup.size} artists`);
  return lookup;
};

/** Upsert the tag vocabulary and return a name -> id lookup. */
const upsertTags = async (works: NormalisedArtwork[]) => {
  const names = [...new Set(works.flatMap((w) => w.tags))].slice(0, 4000);
  const lookup = new Map<string, string>();

  for (const name of names) {
    const tag = await prisma.tag.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { slug: slugify(name), name },
      select: { id: true },
    });
    lookup.set(name, tag.id);
  }

  console.log(`  Linked ${lookup.size} tags`);
  return lookup;
};

/**
 * Drop rows a source no longer returns, so the catalogue mirrors the latest
 * ingest rather than accumulating every object ever fetched. Sources that
 * returned nothing are skipped — a failed fetch must not wipe its collection.
 */
const prune = async (works: NormalisedArtwork[]) => {
  const keep = new Map<string, string[]>();
  for (const work of works) {
    const ids = keep.get(work.source) ?? [];
    ids.push(work.sourceId);
    keep.set(work.source, ids);
  }

  for (const [source, sourceIds] of keep) {
    const { count } = await prisma.artwork.deleteMany({
      where: { source, sourceId: { notIn: sourceIds } },
    });
    if (count > 0) console.log(`  Pruned ${count} stale ${source} rows`);
  }
};

const persist = async (works: NormalisedArtwork[]) => {
  const artists = await upsertArtists(works);
  const tags = await upsertTags(works);

  let written = 0;

  for (const work of works) {
    const { tags: tagNames, slug, ...fields } = work;
    const artistId = artists.get(work.artistName ?? "") ?? null;

    // `slug` is omitted from the update so a re-run never collides with the
    // de-duplication suffix a previous run assigned to a different record.
    const record = await prisma.artwork.upsert({
      where: { source_sourceId: { source: work.source, sourceId: work.sourceId } },
      update: { ...fields, artistId },
      create: { ...fields, slug, artistId },
      select: { id: true },
    });

    // Distinct tag names can collapse onto the same slug, so de-duplicate the
    // ids before insert. SQLite has no `skipDuplicates` to fall back on.
    const tagIds = [
      ...new Set(
        tagNames
          .map((name) => tags.get(name))
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    await prisma.artworkTag.deleteMany({ where: { artworkId: record.id } });

    if (tagIds.length > 0) {
      await prisma.artworkTag.createMany({
        data: tagIds.map((tagId) => ({ artworkId: record.id, tagId })),
      });
    }

    written += 1;
    if (written % 100 === 0) process.stdout.write(`\r  Saved ${written}/${works.length}`);
  }

  process.stdout.write(`\r  Saved ${written}/${works.length}\n`);

  await prune(works);
};

const main = async () => {
  const aicLimit = numericArg("aic", 1200);
  const metLimit = numericArg("met", 600);
  const monumentLimit = numericArg("monuments", 400);
  const marketLimit = numericArg("market", 200);

  console.log("Fetching from public museum APIs…");

  const [aic, met, monuments, market] = await Promise.all([
    fetchArtInstitute(aicLimit),
    fetchMet(metLimit),
    fetchMonuments(monumentLimit),
    fetchMarketSales(marketLimit),
  ]);

  const works = deduplicateSlugs([...aic, ...met, ...monuments, ...market]);

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
