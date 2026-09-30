import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { isCategory, type Category } from "./artwork";
import type { Prisma } from "@/generated/prisma";

export const PAGE_SIZE = 36;

export type SearchParams = {
  q?: string;
  category?: string;
  museum?: string;
  artist?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: string;
};

export type BrowseQuery = {
  q: string;
  category: Category | null;
  museum: string | null;
  artist: string | null;
  from: number | null;
  to: number | null;
  sort: "relevance" | "oldest" | "newest" | "title" | "price";
  page: number;
};

const toInt = (value: string | undefined): number | null => {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

/** Normalise raw URL search params into a validated query object. */
export const parseQuery = (params: SearchParams): BrowseQuery => {
  const sort = params.sort;

  return {
    q: params.q?.trim() ?? "",
    category: params.category && isCategory(params.category) ? params.category : null,
    museum: params.museum?.trim() || null,
    artist: params.artist?.trim() || null,
    from: toInt(params.from),
    to: toInt(params.to),
    sort:
      sort === "oldest" || sort === "newest" || sort === "title" || sort === "price"
        ? sort
        : "relevance",
    page: Math.max(1, toInt(params.page) ?? 1),
  };
};

/** Serialise a query back into a query string, dropping empty values. */
export const buildHref = (
  query: BrowseQuery,
  overrides: Partial<Record<keyof BrowseQuery, string | number | null>> = {},
): string => {
  const merged: Record<string, string | number | null> = {
    q: query.q || null,
    category: query.category,
    museum: query.museum,
    artist: query.artist,
    from: query.from,
    to: query.to,
    sort: query.sort === "relevance" ? null : query.sort,
    page: query.page > 1 ? query.page : null,
    ...overrides,
  };

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== null && value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  const qs = search.toString();
  return qs ? `/browse?${qs}` : "/browse";
};

const buildWhere = (query: BrowseQuery): Prisma.ArtworkWhereInput => {
  const filters: Prisma.ArtworkWhereInput[] = [{ thumbUrl: { not: null } }];

  if (query.q) {
    // Postgres `LIKE` is case-sensitive where SQLite's is not, so the mode has
    // to be spelled out or lowercase searches would return nothing.
    filters.push({
      OR: [
        { title: { contains: query.q, mode: "insensitive" } },
        { artistName: { contains: query.q, mode: "insensitive" } },
        { culture: { contains: query.q, mode: "insensitive" } },
        { medium: { contains: query.q, mode: "insensitive" } },
        { classification: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }

  if (query.category) filters.push({ category: query.category });
  if (query.museum) filters.push({ museum: query.museum });
  if (query.artist) filters.push({ artistName: query.artist });
  if (query.from !== null) filters.push({ yearEnd: { gte: query.from } });
  if (query.to !== null) filters.push({ yearStart: { lte: query.to } });

  // Sorting by price restricts to works that have one. Beyond matching what the
  // reader expects, it keeps the ordering portable: SQLite sorts NULLs last on
  // a descending sort while Postgres sorts them first.
  if (query.sort === "price") filters.push({ salePrice: { not: null } });

  return { AND: filters };
};

const buildOrderBy = (query: BrowseQuery): Prisma.ArtworkOrderByWithRelationInput[] => {
  switch (query.sort) {
    case "oldest":
      return [{ yearStart: "asc" }, { title: "asc" }];
    case "newest":
      return [{ yearStart: "desc" }, { title: "asc" }];
    case "title":
      return [{ title: "asc" }];
    case "price":
      return [{ salePrice: "desc" }, { title: "asc" }];
    default:
      // "Relevance" without a search engine: highlights first, then completeness.
      return [{ isHighlight: "desc" }, { isPublicDomain: "desc" }, { title: "asc" }];
  }
};

export const CARD_FIELDS = {
  id: true,
  slug: true,
  title: true,
  category: true,
  artistName: true,
  dateText: true,
  yearStart: true,
  yearEnd: true,
  thumbUrl: true,
  colorHex: true,
  museum: true,
  salePrice: true,
  saleCurrency: true,
} satisfies Prisma.ArtworkSelect;

export type ArtworkCard = Prisma.ArtworkGetPayload<{ select: typeof CARD_FIELDS }>;

/** Page of results plus the facet counts used to build the sidebar. */
export const searchArtworks = async (query: BrowseQuery) => {
  const where = buildWhere(query);

  const [items, total, categories, museums] = await Promise.all([
    prisma.artwork.findMany({
      where,
      orderBy: buildOrderBy(query),
      select: CARD_FIELDS,
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.artwork.count({ where }),
    prisma.artwork.groupBy({
      by: ["category"],
      where: { AND: [buildWhere({ ...query, category: null })] },
      _count: { _all: true },
    }),
    prisma.artwork.groupBy({
      by: ["museum"],
      where: { AND: [buildWhere({ ...query, museum: null })] },
      _count: { _all: true },
      orderBy: { _count: { museum: "desc" } },
      take: 8,
    }),
  ]);

  return {
    items,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    facets: {
      categories: categories.map((row) => ({
        value: row.category,
        count: row._count._all,
      })),
      museums: museums
        .filter((row) => row.museum)
        .map((row) => ({ value: row.museum!, count: row._count._all })),
    },
  };
};

/** Full record for the detail page, with a few related works for context. */
export const getArtwork = async (slug: string) => {
  const artwork = await prisma.artwork.findUnique({
    where: { slug },
    include: {
      artist: true,
      tags: { include: { tag: true }, take: 12 },
    },
  });

  if (!artwork) return null;

  const related = await prisma.artwork.findMany({
    where: {
      id: { not: artwork.id },
      thumbUrl: { not: null },
      OR: [
        artwork.artistName ? { artistName: artwork.artistName } : {},
        { category: artwork.category },
      ].filter((clause) => Object.keys(clause).length > 0),
    },
    orderBy: [{ isHighlight: "desc" }],
    select: CARD_FIELDS,
    take: 12,
  });

  return { artwork, related };
};

/** Small sample used to fill the landing page hero and rails. */
export const getFeatured = unstable_cache(
  async () => {
    const [highlights, monuments, stats] = await Promise.all([
      prisma.artwork.findMany({
        where: { thumbUrl: { not: null }, isHighlight: true },
        select: CARD_FIELDS,
        take: 12,
      }),
      prisma.artwork.findMany({
        where: { thumbUrl: { not: null }, category: "monument" },
        select: CARD_FIELDS,
        take: 12,
      }),
      prisma.artwork.groupBy({ by: ["category"], _count: { _all: true } }),
    ]);

    // A brand-new database has no highlights flagged; fall back to anything.
    const hero =
      highlights.length > 0
        ? highlights
        : await prisma.artwork.findMany({
            where: { thumbUrl: { not: null } },
            select: CARD_FIELDS,
            take: 12,
          });

    return {
      highlights: hero,
      monuments,
      counts: Object.fromEntries(stats.map((row) => [row.category, row._count._all])),
      total: stats.reduce((sum, row) => sum + row._count._all, 0),
    };
  },
  ["featured"],
  { revalidate: 3600 },
);
