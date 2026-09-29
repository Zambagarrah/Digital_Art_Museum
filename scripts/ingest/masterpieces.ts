import { fetchJson, makeArtwork, type NormalisedArtwork } from "./shared";

const ENDPOINT = "https://query.wikidata.org/sparql";

/**
 * Painting-like types. Museum APIs classify freely, but Wikidata is strict, so
 * a canonical work is easy to miss: The Last Supper is a `fresco`, the Ghent
 * Altarpiece a `polyptych`, The Scream a `group of paintings`. Restricting to
 * `painting` alone would silently drop all three.
 */
const TYPES = [
  "Q3305213", // painting
  "Q55439", // panel painting
  "Q1278452", // polyptych
  "Q22669139", // fresco
  "Q219423", // mural
  "Q132137", // icon
  "Q18573970", // group of paintings
];

/**
 * The collections a canonical painting is most likely to hang in, plus Saint
 * Bavo's Cathedral for the Ghent Altarpiece.
 */
const COLLECTIONS = [
  "Q19675", // Louvre
  "Q160112", // Museo del Prado
  "Q51252", // Uffizi
  "Q190804", // Rijksmuseum
  "Q180788", // National Gallery, London
  "Q132783", // Hermitage
  "Q23402", // Musée d'Orsay
  "Q188740", // Museum of Modern Art
  "Q2977", // Vatican Museums
  "Q214867", // National Gallery of Art
  "Q95569", // Kunsthistorisches Museum
  "Q460889", // Museo Reina Sofía
  "Q224124", // Van Gogh Museum
  "Q221092", // Mauritshuis
  "Q1201549", // Art Institute of Chicago
  "Q842858", // Nationalmuseum
  "Q938154", // Saint Bavo's Cathedral
];

/** Painters whose work is canonical almost regardless of where it hangs. */
const CREATORS = [
  "Q762", // Leonardo da Vinci
  "Q5582", // Vincent van Gogh
  "Q5598", // Rembrandt
  "Q41264", // Johannes Vermeer
  "Q5593", // Pablo Picasso
  "Q296", // Claude Monet
  "Q5592", // Michelangelo
  "Q5597", // Raphael
  "Q42207", // Caravaggio
  "Q5432", // Francisco Goya
  "Q297", // Diego Velázquez
  "Q47551", // Titian
  "Q5669", // Sandro Botticelli
  "Q5580", // Albrecht Dürer
  "Q43270", // Pieter Bruegel the Elder
  "Q41406", // Edvard Munch
  "Q34661", // Gustav Klimt
  "Q5577", // Salvador Dalí
  "Q102272", // Jan van Eyck
  "Q130531", // Hieronymus Bosch
];

const values = (qids: readonly string[]) => qids.map((q) => `wd:${q}`).join(" ");

/**
 * Widely documented paintings, ranked by how many Wikipedias cover them.
 *
 * Sitelink count is a blunt but honest proxy for cultural reach: the Mona Lisa
 * has articles in 146 languages, a minor still life in one. Scanning every
 * painting for that number is far too slow, so the search is anchored to two
 * selective sets — the great collections and the canonical painters — and
 * ranked within them.
 *
 * A work's collection is often a *department* rather than the museum itself
 * (the Mona Lisa belongs to the Louvre's painting department, not the Louvre),
 * so the `part of` chain is followed before matching. The same chain is walked
 * again when reading the collection back, so the museum shown is the one a
 * visitor would name; a plain `P195` only fills in when that fails.
 */
const QUERY = `
SELECT ?item ?itemLabel ?itemDescription ?creatorLabel ?image ?sitelinks
       ?inception ?coll ?collLabel WHERE {
  {
    VALUES ?collection { ${values(COLLECTIONS)} }
    ?item wdt:P195/wdt:P361* ?collection .
  } UNION {
    VALUES ?painter { ${values(CREATORS)} }
    ?item wdt:P170 ?painter .
  }
  VALUES ?type { ${values(TYPES)} }
  ?item wdt:P31 ?type ;
        wdt:P18 ?image ;
        wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P170 ?creator . }
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL {
    VALUES ?coll { ${values(COLLECTIONS)} }
    ?item wdt:P195/wdt:P361* ?coll .
  }
  OPTIONAL { ?item wdt:P195 ?coll . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,nl,it,es". }
}
ORDER BY DESC(?sitelinks)
`;

type Binding = { value: string };

type SparqlResponse = {
  results: { bindings: Record<string, Binding | undefined>[] };
};

const commonsThumb = (imageUrl: string, width: number) =>
  `${imageUrl.replace(/^http:\/\//, "https://")}?width=${width}`;

/**
 * The label service falls back to a bare entity URL when no label exists in any
 * requested language. Those are useless as display text, as are raw Q-ids.
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

export const fetchMasterpieces = async (
  limit: number,
): Promise<NormalisedArtwork[]> => {
  const query = `${QUERY}\nLIMIT ${limit * 3}`;
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;

  const body = await fetchJson<SparqlResponse>(url, {
    retries: 4,
    delayMs: 5000,
    timeoutMs: 120_000,
  });

  const bindings = body?.results?.bindings ?? [];

  if (!bindings.length) {
    console.warn(
      "  Masterpieces: Wikidata returned nothing — the query service may be rate-limiting or down.",
    );
    return [];
  }

  // A work repeats once per creator and collection it links to, and again when
  // it matches both halves of the union. Rows arrive ordered by descending
  // reach, so the first occurrence of an entity is the one to keep — except
  // that Wikidata often lists several collections, including ones holding a
  // single loaned panel. Preferring a row whose collection is one we asked for
  // keeps the Ghent Altarpiece in Saint Bavo's rather than the Bode Museum.
  const wanted = new Set(COLLECTIONS);
  const best = new Map<string, Record<string, Binding | undefined>>();

  for (const row of bindings) {
    const entity = row.item?.value;
    if (!entity) continue;

    const qid = entity.split("/").pop()!;
    const existing = best.get(qid);
    if (!existing) {
      best.set(qid, row);
      continue;
    }

    const held = (binding: Binding | undefined) =>
      wanted.has(binding?.value?.split("/").pop() ?? "");

    if (!held(existing.coll) && held(row.coll)) best.set(qid, row);
  }

  const works = [...best.entries()].flatMap(([qid, row]) => {
    const title = label(row.itemLabel);
    const image = row.image?.value;
    if (!title || !image) return [];

    const reach = Number(row.sitelinks?.value ?? 0);
    const inception = year(row.inception?.value);

    return [
      makeArtwork({
        title,
        category: "painting",
        source: "masterpieces",
        sourceId: qid,
        sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
        wikidataId: qid,
        artistName: label(row.creatorLabel),
        description: row.itemDescription?.value ?? null,
        dateText: inception === null ? null : String(inception),
        classification: "painting",
        medium: null,
        museum: label(row.collLabel),
        imageUrl: commonsThumb(image, 1600),
        thumbUrl: commonsThumb(image, 400),
        creditLine: "Image via Wikimedia Commons",
        isPublicDomain: true,
        // Documented in 40+ languages puts a work in Mona Lisa / Guernica
        // territory — worth surfacing on the home page.
        isHighlight: reach >= 40,
        tags: ["Masterpiece"],
      }),
    ];
  });

  return works.slice(0, limit);
};
