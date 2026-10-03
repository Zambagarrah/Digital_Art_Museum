import {
  fetchJson,
  makeArtwork,
  sampleEvenly,
  sleep,
  type NormalisedArtwork,
} from "./shared";

const API = "https://openaccess-api.clevelandart.org/api/artworks/";
const PAGE_SIZE = 1000;
const MUSEUM = "Cleveland Museum of Art";

const GROUPS = [
  { category: "painting", share: 0.34, types: ["Painting"] },
  { category: "sculpture", share: 0.3, types: ["Sculpture", "Relief"] },
  {
    category: "artifact",
    share: 0.36,
    types: [
      "Amulets",
      "Arms and Armor",
      "Basketry",
      "Book Binding",
      "Bound Volume",
      "Carpet",
      "Ceramic",
      "Coins",
      "Cosmetic Objects",
      "Embroidery",
      "Funerary Equipment",
      "Garment",
      "Glass",
      "Jewelry",
      "Manuscript",
      "Metalwork",
      "Musical Instrument",
      "Papyri",
      "Scarabs",
      "Seals",
      "Textile",
      "Vessels",
      "Wood",
    ],
  },
] as const;

type CmaRecord = {
  id: number;
  title: string | null;
  creation_date: string | null;
  creation_date_earliest: number | null;
  creation_date_latest: number | null;
  creators: { description: string | null; role: string | null }[] | null;
  culture: string[] | null;
  technique: string | null;
  support_materials: string[] | null;
  department: string | null;
  collection: string | null;
  type: string | null;
  measurements: string | null;
  description: string | null;
  provenance: { description: string | null }[] | null;
  external_resources?: { wikidata?: string[] | null } | null;
  url: string | null;
  images: {
    web?: { url?: string | null } | null;
    print?: { url?: string | null } | null;
  } | null;
  share_license_status: string | null;
  creditline: string | null;
  is_highlight: boolean | null;
};

type CmaResponse = { info?: { total?: number }; data?: CmaRecord[] };

const artistName = (record: CmaRecord) => {
  const creator =
    record.creators?.find((item) => item.role?.toLowerCase() === "artist") ??
    record.creators?.[0];
  return creator?.description?.split(/\s+\(/, 1)[0] ?? null;
};

const toArtwork = (
  record: CmaRecord,
  category: string,
): NormalisedArtwork | null => {
  const image = record.images?.web?.url;
  if (!record.title || !image) return null;

  const culture = record.culture?.filter(Boolean).join(", ") ?? null;
  const provenance =
    record.provenance
      ?.map((entry) => entry.description)
      .filter((entry): entry is string => Boolean(entry))
      .join("\n") ?? null;

  return makeArtwork({
    title: record.title,
    category,
    source: "cleveland",
    sourceId: String(record.id),
    sourceUrl: record.url,
    wikidataId:
      record.external_resources?.wikidata?.[0]?.match(/Q\d+/)?.[0] ?? null,
    artistName: artistName(record),
    dateText: record.creation_date,
    yearStart: record.creation_date_earliest ?? undefined,
    yearEnd: record.creation_date_latest ?? undefined,
    medium: [record.technique, ...(record.support_materials ?? [])]
      .filter(Boolean)
      .join("; "),
    dimensions: record.measurements,
    culture,
    classification: record.type,
    description: record.description,
    interpretation: record.description,
    interpretationSource: record.description ? MUSEUM : null,
    interpretationUrl: record.description ? record.url : null,
    museum: MUSEUM,
    department: record.department,
    city: "Cleveland",
    country: "United States",
    imageUrl: record.images?.print?.url ?? image,
    thumbUrl: image,
    creditLine: record.creditline,
    provenance,
    isPublicDomain: record.share_license_status === "CC0",
    isHighlight: Boolean(record.is_highlight),
    tags: [record.type, record.collection, ...(record.culture ?? [])].filter(
      (tag): tag is string => Boolean(tag),
    ),
  });
};

const fetchType = async (
  type: string,
  limit: number,
): Promise<CmaRecord[]> => {
  const url = new URL(API);
  url.searchParams.set("type", type);
  url.searchParams.set("has_image", "1");
  url.searchParams.append("cc0", "");
  const candidateLimit = Math.max(limit * 3, 30);
  const pageSize = Math.min(PAGE_SIZE, candidateLimit);
  url.searchParams.set("limit", String(pageSize));

  const firstPage = await fetchJson<CmaResponse>(url.toString());
  if (!firstPage?.data?.length) return [];

  const total = firstPage.info?.total ?? firstPage.data.length;
  const pageCount = Math.min(
    Math.ceil(candidateLimit / pageSize),
    Math.ceil(total / pageSize),
  );
  const finalOffset = Math.max(0, total - pageSize);
  const offsets = Array.from({ length: pageCount }, (_, index) =>
    pageCount === 1
      ? 0
      : Math.round((index * finalOffset) / (pageCount - 1)),
  );
  const records = new Map<number, CmaRecord>();

  for (const [index, offset] of offsets.entries()) {
    if (index > 0) {
      await sleep(120);
      url.searchParams.set("skip", String(offset));
    }

    const page =
      index === 0 ? firstPage : await fetchJson<CmaResponse>(url.toString());
    for (const record of page?.data ?? []) records.set(record.id, record);
  }

  return sampleEvenly([...records.values()], limit);
};

/** Sample CC0 image records across fine-art and historical-object types. */
export const fetchCleveland = async (
  limit: number,
): Promise<NormalisedArtwork[]> => {
  const selected: NormalisedArtwork[] = [];
  const seen = new Set<number>();

  for (const group of GROUPS) {
    const groupLimit = Math.floor(limit * group.share);
    const perType = Math.ceil(groupLimit / group.types.length);

    for (const type of group.types) {
      const records = await fetchType(type, perType);
      for (const record of records) {
        if (seen.has(record.id)) continue;
        seen.add(record.id);

        const artwork = toArtwork(record, group.category);
        if (artwork) selected.push(artwork);
      }
      await sleep(120);
    }
  }

  const works = selected.slice(0, limit);
  console.log(`  Cleveland Museum: ${works.length} works`);
  return works;
};