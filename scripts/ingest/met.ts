import {
  fetchJson,
  makeArtwork,
  mapWithConcurrency,
  sampleEvenly,
  sleep,
  type NormalisedArtwork,
} from "./shared";

const API = "https://collectionapi.metmuseum.org/public/collection/v1";

/** Pause between object requests; the Met 403s sustained bursts. */
const REQUEST_GAP_MS = 150;

/** Give up after this many consecutive failures — we are being throttled. */
const MISS_LIMIT = 120;

type MetSearch = { total: number; objectIDs: number[] | null };

type MetObject = {
  objectID: number;
  title: string | null;
  artistDisplayName: string | null;
  objectDate: string | null;
  objectBeginDate: number | null;
  objectEndDate: number | null;
  medium: string | null;
  dimensions: string | null;
  culture: string | null;
  classification: string | null;
  department: string | null;
  creditLine: string | null;
  primaryImage: string | null;
  primaryImageSmall: string | null;
  objectURL: string | null;
  objectWikidata_URL: string | null;
  isPublicDomain: boolean | null;
  isHighlight: boolean | null;
  tags: { term: string }[] | null;
};

/** Pull the bare Q-id out of a Wikidata entity URL. */
const wikidataId = (url: string | null): string | null =>
  url?.match(/(Q\d+)\s*$/)?.[1] ?? null;

const toArtwork = (item: MetObject): NormalisedArtwork | null => {
  if (!item.title || !item.primaryImageSmall) return null;

  return makeArtwork({
    title: item.title,
    source: "met",
    sourceId: String(item.objectID),
    sourceUrl: item.objectURL,
    artistName: item.artistDisplayName,
    dateText: item.objectDate,
    yearStart: item.objectBeginDate ?? undefined,
    yearEnd: item.objectEndDate ?? undefined,
    medium: item.medium,
    dimensions: item.dimensions,
    culture: item.culture,
    classification: item.classification,
    museum: "The Metropolitan Museum of Art",
    department: item.department,
    city: "New York",
    country: "United States",
    imageUrl: item.primaryImage || item.primaryImageSmall,
    thumbUrl: item.primaryImageSmall,
    creditLine: item.creditLine,
    wikidataId: wikidataId(item.objectWikidata_URL),
    isPublicDomain: Boolean(item.isPublicDomain),
    isHighlight: Boolean(item.isHighlight),
    tags: (item.tags ?? []).map((t) => t.term),
  });
};

/**
 * The Met has no bulk endpoint, so we search per medium and then fetch each
 * object individually.
 *
 * Results are sampled across the whole id list rather than taken from the head,
 * because the top of a Met relevance ranking is a long run of near-duplicates
 * (dozens of records literally titled "Painting", most without imagery).
 */
export const fetchMet = async (limit: number): Promise<NormalisedArtwork[]> => {
  const queries = [
    "oil painting",
    "sculpture",
    "portrait",
    "landscape",
    "marble statue",
    "bronze figure",
  ];

  // Over-fetch: roughly half of Met records carry no public image, and the
  // API sheds load with 403s that we skip rather than wait out.
  const target = Math.ceil(limit * 3);
  const perQuery = Math.ceil(target / queries.length);
  const ids = new Set<number>();

  for (const q of queries) {
    const search = await fetchJson<MetSearch>(
      `${API}/search?hasImages=true&q=${encodeURIComponent(q)}`,
    );
    for (const id of sampleEvenly(search?.objectIDs ?? [], perQuery)) ids.add(id);
  }

  const objectIds = [...ids];
  let done = 0;
  let kept = 0;
  let consecutiveMisses = 0;

  // The Met sheds bursts with 403s, so requests are paced rather than fanned
  // out. Once `limit` usable records are in hand the remaining ids are skipped,
  // and a long run of misses means we are being throttled — stop early instead
  // of hammering a closed door.
  const objects = await mapWithConcurrency(objectIds, 2, async (id) => {
    if (kept >= limit || consecutiveMisses >= MISS_LIMIT) return null;

    await sleep(REQUEST_GAP_MS);

    const object = await fetchJson<MetObject>(`${API}/objects/${id}`, {
      retries: 2,
      delayMs: 1500,
      timeoutMs: 15_000,
    });

    done += 1;

    const artwork = object ? toArtwork(object) : null;
    if (artwork) {
      kept += 1;
      consecutiveMisses = 0;
    } else {
      consecutiveMisses += 1;
    }

    if (done % 25 === 0) {
      process.stdout.write(`\r  Met Museum: ${kept} kept / ${done} checked`);
    }

    return artwork;
  });

  const works = objects
    .filter((a): a is NormalisedArtwork => a !== null)
    .slice(0, limit);

  process.stdout.write(`\r  Met Museum: ${works.length} works\n`);
  return works;
};
