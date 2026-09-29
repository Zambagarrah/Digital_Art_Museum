import { fetchJson, makeArtwork, type NormalisedArtwork } from "./shared";

const ENDPOINT = "https://query.wikidata.org/sparql";

/**
 * UNESCO World Heritage sites (wd:Q9259) that carry both a photograph and
 * coordinates — exactly the subset that renders well on a map and in a grid.
 */
const QUERY = `
SELECT ?item ?itemLabel ?itemDescription ?image ?coord ?inception ?countryLabel ?styleLabel WHERE {
  ?item wdt:P1435 wd:Q9259 ;
        wdt:P18 ?image ;
        wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL { ?item wdt:P17 ?country . }
  OPTIONAL { ?item wdt:P149 ?style . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT %LIMIT%
`;

type Binding = { value: string };

type SparqlResponse = {
  results: {
    bindings: Record<string, Binding | undefined>[];
  };
};

/** "Point(12.4922 41.8902)" -> { longitude, latitude } */
const parsePoint = (wkt: string | undefined) => {
  const match = wkt?.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!match) return { latitude: null, longitude: null };
  return { longitude: Number(match[1]), latitude: Number(match[2]) };
};

/**
 * Wikidata hands back Commons URLs over plain http, which browsers block as
 * mixed content once the site is served over https.
 */
const commonsThumb = (imageUrl: string, width: number) =>
  `${imageUrl.replace(/^http:\/\//, "https://")}?width=${width}`;

export const fetchMonuments = async (limit: number): Promise<NormalisedArtwork[]> => {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(
    QUERY.replace("%LIMIT%", String(limit)),
  )}`;

  const body = await fetchJson<SparqlResponse>(url, { retries: 2, delayMs: 2000 });
  const bindings = body?.results?.bindings ?? [];

  const works = bindings.flatMap((row) => {
    const label = row.itemLabel?.value;
    const image = row.image?.value;
    const entity = row.item?.value;
    if (!label || !image || !entity) return [];

    // Skip rows where the label service fell back to the raw Q-id.
    if (/^Q\d+$/.test(label)) return [];

    const qid = entity.split("/").pop()!;
    const { latitude, longitude } = parsePoint(row.coord?.value);
    const inception = row.inception?.value?.slice(0, 4);

    return [
      makeArtwork({
        title: label,
        category: "monument",
        source: "wikidata",
        sourceId: qid,
        sourceUrl: entity,
        description: row.itemDescription?.value,
        dateText: inception ?? null,
        classification: row.styleLabel?.value ?? "monument",
        country: row.countryLabel?.value ?? null,
        latitude,
        longitude,
        imageUrl: commonsThumb(image, 1600),
        thumbUrl: commonsThumb(image, 400),
        museum: "UNESCO World Heritage",
        creditLine: "Image via Wikimedia Commons",
        isPublicDomain: true,
        tags: ["UNESCO World Heritage", row.styleLabel?.value].filter(
          (t): t is string => Boolean(t),
        ),
      }),
    ];
  });

  console.log(`  Wikidata monuments: ${works.length} sites`);
  return works;
};
