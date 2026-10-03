import { classify, cleanProse, cleanText, parseYearRange, slugify } from "../../src/lib/artwork";

/** The shape every source adapter normalises to before it reaches the database. */
export type NormalisedArtwork = {
  slug: string;
  title: string;
  category: string;
  artistName: string | null;
  dateText: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  medium: string | null;
  dimensions: string | null;
  culture: string | null;
  classification: string | null;
  description: string | null;
  interpretation: string | null;
  interpretationSource: string | null;
  interpretationUrl: string | null;
  museum: string | null;
  department: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  iiifBaseUrl: string | null;
  colorHex: string | null;
  source: string;
  sourceId: string;
  sourceUrl: string | null;
  wikidataId: string | null;
  creditLine: string | null;
  provenance: string | null;
  salePrice: number | null;
  saleCurrency: string | null;
  saleDate: string | null;
  saleYear: number | null;
  saleSourceUrl: string | null;
  isPublicDomain: boolean;
  isHighlight: boolean;
  tags: string[];
};

/** Build a record with every optional field defaulted, so adapters stay terse. */
export const makeArtwork = (
  input: Partial<NormalisedArtwork> & {
    title: string;
    source: string;
    sourceId: string;
  },
): NormalisedArtwork => {
  const dateText = cleanText(input.dateText);
  const parsed = parseYearRange(dateText);

  return {
    slug: input.slug ?? slugify(input.title, `${input.source}-${input.sourceId}`),
    title: cleanText(input.title) ?? "Untitled",
    category:
      input.category ?? classify(input.classification, input.medium),
    artistName: cleanText(input.artistName),
    dateText,
    yearStart: input.yearStart ?? parsed.yearStart,
    yearEnd: input.yearEnd ?? parsed.yearEnd,
    medium: cleanText(input.medium),
    dimensions: cleanText(input.dimensions),
    culture: cleanText(input.culture),
    classification: cleanText(input.classification),
    description: cleanText(input.description),
    interpretation: cleanProse(input.interpretation),
    interpretationSource: input.interpretationSource ?? null,
    interpretationUrl: input.interpretationUrl ?? null,
    museum: input.museum ?? null,
    department: cleanText(input.department),
    city: input.city ?? null,
    country: input.country ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    imageUrl: input.imageUrl ?? null,
    thumbUrl: input.thumbUrl ?? input.imageUrl ?? null,
    iiifBaseUrl: input.iiifBaseUrl ?? null,
    colorHex: input.colorHex ?? null,
    source: input.source,
    sourceId: input.sourceId,
    sourceUrl: input.sourceUrl ?? null,
    wikidataId: input.wikidataId ?? null,
    creditLine: cleanText(input.creditLine),
    provenance: cleanProse(input.provenance),
    salePrice: input.salePrice ?? null,
    saleCurrency: input.saleCurrency ?? null,
    saleDate: input.saleDate ?? null,
    saleYear: input.saleYear ?? null,
    saleSourceUrl: input.saleSourceUrl ?? null,
    isPublicDomain: input.isPublicDomain ?? false,
    isHighlight: input.isHighlight ?? false,
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
  };
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Status codes worth retrying: throttling, bot-detection and server faults. */
const isRetryable = (status: number) =>
  status === 403 || status === 408 || status === 429 || status >= 500;

/**
 * Fetch JSON with retry and backoff. Museum APIs are generous but throttle
 * bursts — the Met in particular answers 403 under load — so a single failure
 * should never abort a long ingest run.
 */
export const fetchJson = async <T>(
  url: string,
  {
    retries = 4,
    delayMs = 600,
    timeoutMs = 30_000,
  }: { retries?: number; delayMs?: number; timeoutMs?: number } = {},
): Promise<T | null> => {
  let failure = "unknown error";
  const host = new URL(url).hostname;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "DigitalArtMuseum/0.1 (open-source catalogue project)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) return (await response.json()) as T;
      failure = `HTTP ${response.status}`;
      if (!isRetryable(response.status)) {
        console.warn(`  Fetch ${host} failed: ${failure}`);
        return null;
      }
    } catch (error) {
      // Network hiccup or timeout — fall through to the retry.
      failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }

    if (attempt < retries) await sleep(delayMs * 2 ** attempt);
  }

  console.warn(`  Fetch ${host} failed after ${retries + 1} attempts: ${failure}`);
  return null;
};

/**
 * Take `count` items spread evenly across `items`.
 *
 * Search endpoints rank by relevance, and the head of a museum result list is
 * dominated by near-identical records. Sampling across the whole list yields a
 * far more varied gallery.
 */
export const sampleEvenly = <T>(items: readonly T[], count: number): T[] => {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
};

/** Run `worker` over `items` with a bounded number of in-flight requests. */
export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
};
