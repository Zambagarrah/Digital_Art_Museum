import { fetchJson, makeArtwork, type NormalisedArtwork } from "./shared";

const ENDPOINT = "https://query.wikidata.org/sparql";

/**
 * Paintings with a publicly recorded sale price.
 *
 * Museum holdings have no market value — they are not for sale and their
 * insurance valuations are never published — so a price can only be shown for
 * works that genuinely changed hands on the open market. Wikidata's P2284
 * covers exactly those, with the auction date and currency attached.
 *
 * Requiring an image (P18) also keeps the set legally safe: Wikimedia Commons
 * only hosts freely licensed files, so in-copyright works self-exclude.
 */
const QUERY = `
SELECT ?item ?itemLabel ?itemDescription ?creatorLabel ?image ?price ?iso ?unitLabel
       ?pit ?inception ?collectionLabel ?materialLabel WHERE {
  ?item wdt:P31 wd:Q3305213 ;
        wdt:P18 ?image ;
        p:P2284 ?statement .
  ?statement psv:P2284 ?node .
  ?node wikibase:quantityAmount ?price ;
        wikibase:quantityUnit ?unit .
  OPTIONAL { ?unit wdt:P498 ?iso . }
  OPTIONAL { ?statement pq:P585 ?pit . }
  OPTIONAL { ?item wdt:P170 ?creator . }
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL { ?item wdt:P195 ?collection . }
  OPTIONAL { ?item wdt:P186 ?material . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,nl,it,es". }
}
ORDER BY DESC(?price)
`;

type Binding = { value: string };

type SparqlResponse = {
  results: { bindings: Record<string, Binding | undefined>[] };
};

const commonsThumb = (imageUrl: string, width: number) =>
  `${imageUrl.replace(/^http:\/\//, "https://")}?width=${width}`;

/**
 * The label service returns a bare entity URL when no English label exists.
 * Those are useless as display text, as are raw Q-ids.
 */
const label = (binding: Binding | undefined): string | null => {
  const value = binding?.value?.trim();
  if (!value || value.startsWith("http") || /^Q\d+$/.test(value)) return null;
  return value;
};

const year = (value: string | undefined): number | null => {
  const match = value?.match(/^(-?\d{1,4})/);
  return match ? Number(match[1]) : null;
};

export const fetchMarketSales = async (
  limit: number,
): Promise<NormalisedArtwork[]> => {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(QUERY)}`;
  const body = await fetchJson<SparqlResponse>(url, {
    retries: 4,
    delayMs: 8000,
    timeoutMs: 120_000,
  });

  const bindings = body?.results?.bindings ?? [];

  // A work repeats once per collection or material it is linked to. Results are
  // ordered by descending price, so the first row for an entity already carries
  // its record sale.
  const best = new Map<string, Record<string, Binding | undefined>>();
  for (const row of bindings) {
    const entity = row.item?.value;
    if (!entity) continue;
    const qid = entity.split("/").pop()!;
    if (!best.has(qid)) best.set(qid, row);
  }

  const works = [...best.entries()].flatMap(([qid, row]) => {
    const title = label(row.itemLabel);
    const image = row.image?.value;
    const price = Number(row.price?.value);
    if (!title || !image || !Number.isFinite(price) || price <= 0) return [];

    const saleDate = row.pit?.value?.slice(0, 10) ?? null;
    const inception = row.inception?.value?.slice(0, 4) ?? null;

    return [
      makeArtwork({
        title,
        category: "painting",
        source: "market",
        sourceId: qid,
        sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
        wikidataId: qid,
        artistName: label(row.creatorLabel),
        description: row.itemDescription?.value ?? null,
        dateText: inception,
        classification: "painting",
        medium: label(row.materialLabel),
        museum: label(row.collectionLabel),
        imageUrl: commonsThumb(image, 1600),
        thumbUrl: commonsThumb(image, 400),
        creditLine: "Image via Wikimedia Commons",
        salePrice: price,
        saleCurrency: label(row.iso) ?? label(row.unitLabel),
        saleDate,
        saleYear: year(saleDate ?? undefined),
        saleSourceUrl: `https://www.wikidata.org/wiki/${qid}#P2284`,
        isPublicDomain: true,
        isHighlight: true,
        tags: ["Record sale"],
      }),
    ];
  });

  // `best` preserves the descending-price order, so slicing keeps the top sales.
  const selected = works.slice(0, limit);
  console.log(`  Market sales: ${selected.length} works`);
  return selected;
};
