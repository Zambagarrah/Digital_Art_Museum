import { fetchJson, type NormalisedArtwork } from "./shared";

/** Wikimedia's action APIs accept up to 50 titles or ids per request. */
const BATCH = 50;

/**
 * `prop=extracts` is far stricter than the rest of the action API: it caps at
 * 20 pages per request and returns just one unless `exlimit` is raised.
 */
const EXTRACT_BATCH = 20;

const chunk = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

type SitelinkResponse = {
  entities?: Record<string, { sitelinks?: { enwiki?: { title?: string } } }>;
};

/** Map Wikidata Q-ids to their English Wikipedia article titles. */
const resolveArticles = async (
  qids: readonly string[],
): Promise<Map<string, string>> => {
  const resolved = new Map<string, string>();

  for (const batch of chunk(qids, BATCH)) {
    const url =
      "https://www.wikidata.org/w/api.php?action=wbgetentities" +
      `&ids=${batch.join("|")}` +
      "&props=sitelinks&sitefilter=enwiki&format=json&origin=*";

    const body = await fetchJson<SitelinkResponse>(url, {
      retries: 4,
      timeoutMs: 45_000,
    });

    if (!body?.entities) {
      console.warn(`  Wikipedia: sitelink batch of ${batch.length} failed`);
      continue;
    }

    for (const [qid, entity] of Object.entries(body.entities)) {
      const title = entity.sitelinks?.enwiki?.title;
      if (title) resolved.set(qid, title);
    }
  }

  return resolved;
};

type ExtractResponse = {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: Record<string, { title?: string; extract?: string; missing?: string }>;
  };
};

/**
 * Fetch the lead section of each article, keyed by the title we asked for.
 *
 * MediaWiki rewrites titles twice on the way in — normalisation then redirect
 * resolution — so the response has to be walked back through both maps for the
 * caller to recognise what it requested.
 */
const fetchExtracts = async (
  titles: readonly string[],
): Promise<Map<string, string>> => {
  const extracts = new Map<string, string>();

  for (const batch of chunk(titles, EXTRACT_BATCH)) {
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&prop=extracts" +
      `&exintro=1&explaintext=1&exlimit=${EXTRACT_BATCH}` +
      "&redirects=1&format=json&origin=*" +
      `&titles=${batch.map(encodeURIComponent).join("|")}`;

    const body = await fetchJson<ExtractResponse>(url, {
      retries: 4,
      timeoutMs: 45_000,
    });
    if (!body?.query) {
      console.warn(`  Wikipedia: extract batch of ${batch.length} failed`);
      continue;
    }

    const rewrites = new Map<string, string>();
    for (const { from, to } of body.query.normalized ?? []) rewrites.set(from, to);
    for (const { from, to } of body.query.redirects ?? []) rewrites.set(from, to);

    const byTitle = new Map<string, string>();
    for (const page of Object.values(body.query.pages ?? {})) {
      if (page.title && page.extract) byTitle.set(page.title, page.extract);
    }

    for (const requested of batch) {
      // Follow the rewrite chain, guarding against a redirect loop.
      let current = requested;
      for (let hop = 0; hop < 4; hop += 1) {
        const next = rewrites.get(current);
        if (!next || next === current) break;
        current = next;
      }

      const extract = byTitle.get(current);
      if (extract) extracts.set(requested, extract);
    }
  }

  return extracts;
};

/**
 * The subset of a work Wikipedia enrichment needs. Kept narrower than
 * `NormalisedArtwork` so the same pass can run over rows read back from the
 * database, not just freshly ingested objects.
 */
export type Enrichable = Pick<
  NormalisedArtwork,
  "source" | "wikidataId" | "interpretation" | "interpretationSource" | "interpretationUrl"
>;

/**
 * Attach encyclopedic context to works whose source supplied none.
 *
 * The Met publishes no interpretive text and Wikidata gives only a one-line
 * description, so both lean on Wikipedia. Works that already carry curatorial
 * prose from their museum keep it — a curator writing about their own holding
 * beats a general encyclopedia.
 */
export const enrichWithWikipedia = async (
  works: Enrichable[],
): Promise<number> => {
  const pending = works.filter((w) => w.wikidataId && !w.interpretation);
  if (!pending.length) return 0;

  const qids = [...new Set(pending.map((w) => w.wikidataId!))];
  const articles = await resolveArticles(qids);

  const titles = [...new Set([...articles.values()])];
  if (!titles.length) return 0;

  const extracts = await fetchExtracts(titles);

  let enriched = 0;
  for (const work of pending) {
    const title = articles.get(work.wikidataId!);
    const extract = title ? extracts.get(title) : undefined;
    if (!title || !extract) continue;

    work.interpretation = extract.trim();
    work.interpretationSource = "Wikipedia";
    work.interpretationUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(
      title.replace(/ /g, "_"),
    )}`;
    enriched += 1;
  }

  console.log(`  Wikipedia: ${enriched} works given context`);
  const bySource = new Map<string, number>();
  for (const work of pending) {
    if (!work.interpretation) continue;
    bySource.set(work.source, (bySource.get(work.source) ?? 0) + 1);
  }
  for (const [source, count] of bySource) console.log(`    ${source}: ${count}`);
  return enriched;
};
