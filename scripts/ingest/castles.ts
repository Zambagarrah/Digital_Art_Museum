import { CASTLES_COLLECTION, formatYear } from "../../src/lib/artwork";
import { ordinal } from "../../src/lib/narrative";
import { fetchJson, makeArtwork, type NormalisedArtwork } from "./shared";

const ENDPOINT = "https://query.wikidata.org/sparql";

/**
 * "castle" plus the subclasses that hold well-documented European castles.
 * Walking the whole subclass tree (`wdt:P279*`) times out on the query service.
 */
const TYPES = [
  "Q23413", // castle
  "Q17715832", // castle ruin
  "Q91312", // tower house
  "Q92062", // motte-and-bailey castle
  "Q92107", // quadrangular castle
  "Q365216", // Ordensburg
  "Q13127000", // Welsh princes' castle
  "Q595968", // hilltop castle
  "Q15710038", // hill castle
  "Q91717", // alcazaba
  "Q613611", // alcázar
];

/**
 * Standing European castles with a photograph and coordinates, covered by at
 * least eight Wikipedias and ranked by that reach. Demolished castles (P576)
 * are skipped, and Turkey because most of its castles stand in Anatolia. The
 * optimizer hint stops the planner from starting with every item in Europe,
 * which times out.
 */
const QUERY = `
SELECT ?item ?itemLabel ?itemDescription ?image ?coord ?sitelinks ?countryLabel
       ?inception ?precision ?styleLabel ?unesco WHERE {
  {
    SELECT DISTINCT ?item ?sitelinks WHERE {
      hint:Query hint:optimizer "None" .
      VALUES ?type { ${TYPES.map((qid) => `wd:${qid}`).join(" ")} }
      ?item wdt:P31 ?type ;
            wikibase:sitelinks ?sitelinks .
      FILTER(?sitelinks >= 8)
      FILTER NOT EXISTS { ?item wdt:P576 [] }
      ?item wdt:P17 ?country .
      ?country wdt:P30 wd:Q46 .
      FILTER(?country != wd:Q43)
      ?item wdt:P18 [] ;
            wdt:P625 [] .
    }
    ORDER BY DESC(?sitelinks)
    LIMIT %LIMIT%
  }
  ?item wdt:P18 ?image ;
        wdt:P625 ?coord ;
        wdt:P17 ?country .
  OPTIONAL {
    ?item p:P571/psv:P571 ?time .
    ?time wikibase:timeValue ?inception ;
          wikibase:timePrecision ?precision .
  }
  OPTIONAL { ?item wdt:P149 ?style . }
  OPTIONAL { ?item wdt:P1435 wd:Q9259 . BIND("yes" AS ?unesco) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,it,pl,cs,nl". }
}
ORDER BY DESC(?sitelinks)
`;

type Binding = { value: string };

type Row = Record<string, Binding | undefined>;

type SparqlResponse = { results: { bindings: Row[] } };

const commonsThumb = (imageUrl: string, width: number) =>
  `${imageUrl.replace(/^http:\/\//, "https://")}?width=${width}`;

/** The label service falls back to a bare Q-id or URL when no label exists. */
const label = (binding: Binding | undefined): string | null => {
  const value = binding?.value?.trim();
  if (!value || value.startsWith("http") || /^Q\d+$/.test(value)) return null;
  return value;
};

/** "Point(12.4922 41.8902)" -> { longitude, latitude } */
const parsePoint = (wkt: string | undefined) => {
  const match = wkt?.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!match) return { latitude: null, longitude: null };
  return { longitude: Number(match[1]), latitude: Number(match[2]) };
};

/** Wikidata dates carry a precision: 7 is a century, 8 a decade, 9 or more a year. */
const dating = (
  time: string | undefined,
  precision: string | undefined,
): { dateText?: string | null; yearStart?: number; yearEnd?: number } => {
  const match = time ? /^(-?)(\d+)-/.exec(time) : null;
  const level = Number(precision);
  if (!match || level < 7) return {};

  const year = Number(match[2]) * (match[1] ? -1 : 1);

  // `makeArtwork` derives the year range from the century text.
  if (level === 7) {
    const century = Math.max(1, Math.ceil(Math.abs(year) / 100));
    return { dateText: `${ordinal(century)} century${year < 0 ? " BCE" : ""}` };
  }

  if (level === 8 && year > 0) {
    const decade = year - (year % 10);
    return { dateText: `${decade}s`, yearStart: decade, yearEnd: decade + 9 };
  }

  return { dateText: formatYear(year, year), yearStart: year, yearEnd: year };
};

export const fetchCastles = async (limit: number): Promise<NormalisedArtwork[]> => {
  const query = QUERY.replace("%LIMIT%", String(Math.ceil(limit * 1.1)));
  const body = await fetchJson<SparqlResponse>(
    `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`,
    { retries: 4, delayMs: 5000, timeoutMs: 120_000 },
  );

  // A castle repeats once per date, style or photograph; rows arrive by
  // descending reach, so its first row is the one kept.
  const firstRows = new Map<string, Row>();
  for (const row of body?.results?.bindings ?? []) {
    const qid = row.item?.value.split("/").pop();
    if (qid && !firstRows.has(qid)) firstRows.set(qid, row);
  }

  const castles = [...firstRows.entries()]
    .flatMap(([qid, row]) => {
      const title = label(row.itemLabel);
      const image = row.image?.value;
      if (!title || !image) return [];

      const style = label(row.styleLabel);
      const { latitude, longitude } = parsePoint(row.coord?.value);

      return [
        makeArtwork({
          title,
          category: "monument",
          source: "castles",
          sourceId: qid,
          sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
          wikidataId: qid,
          description: row.itemDescription?.value ?? null,
          ...dating(row.inception?.value, row.precision?.value),
          classification: style ?? "castle",
          country: label(row.countryLabel),
          latitude,
          longitude,
          imageUrl: commonsThumb(image, 1600),
          thumbUrl: commonsThumb(image, 400),
          museum: CASTLES_COLLECTION,
          creditLine: "Image via Wikimedia Commons",
          reach: Number(row.sitelinks?.value) || null,
          tags: ["Castle", row.unesco ? "UNESCO World Heritage" : null, style].filter(
            (tag): tag is string => Boolean(tag),
          ),
        }),
      ];
    })
    .slice(0, limit);

  console.log(`  Castles of Europe: ${castles.length} castles`);
  return castles;
};
