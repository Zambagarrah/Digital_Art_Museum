import { fetchJson, makeArtwork, type NormalisedArtwork } from "./shared";

/** Only the fields we consume, so the request URL stays small and fast. */
const FIELDS = [
  "id",
  "title",
  "artist_title",
  "date_display",
  "date_start",
  "date_end",
  "medium_display",
  "dimensions",
  "classification_title",
  "artwork_type_title",
  "place_of_origin",
  "image_id",
  "is_public_domain",
  "credit_line",
  "department_title",
  "term_titles",
  "description",
  "short_description",
  "provenance_text",
  "color",
].join(",");

type AicArtwork = {
  id: number;
  title: string | null;
  artist_title: string | null;
  date_display: string | null;
  date_start: number | null;
  date_end: number | null;
  medium_display: string | null;
  dimensions: string | null;
  classification_title: string | null;
  artwork_type_title: string | null;
  place_of_origin: string | null;
  image_id: string | null;
  is_public_domain: boolean | null;
  credit_line: string | null;
  department_title: string | null;
  term_titles: string[] | null;
  description: string | null;
  short_description: string | null;
  provenance_text: string | null;
  color: { h: number; s: number; l: number } | null;
};

type AicPage = {
  data: AicArtwork[];
  pagination: { total: number; total_pages: number; current_page: number };
};

const IIIF_ROOT = "https://www.artic.edu/iiif/2";

const hslToHex = (color: AicArtwork["color"]): string | null => {
  if (!color) return null;
  const h = color.h / 360;
  const s = color.s / 100;
  const l = color.l / 100;

  const channel = (offset: number) => {
    const k = (offset + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const value = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, "0");
  };

  return `#${channel(0)}${channel(8)}${channel(4)}`;
};

const toArtwork = (item: AicArtwork): NormalisedArtwork | null => {
  if (!item.title || !item.image_id) return null;

  const iiifBaseUrl = `${IIIF_ROOT}/${item.image_id}`;

  return makeArtwork({
    title: item.title,
    source: "aic",
    sourceId: String(item.id),
    sourceUrl: `https://www.artic.edu/artworks/${item.id}`,
    artistName: item.artist_title,
    dateText: item.date_display,
    yearStart: item.date_start ?? undefined,
    yearEnd: item.date_end ?? undefined,
    medium: item.medium_display,
    dimensions: item.dimensions,
    culture: item.place_of_origin,
    classification: item.classification_title ?? item.artwork_type_title,
    description: item.short_description,
    interpretation: item.description,
    interpretationSource: item.description ? "Art Institute of Chicago" : null,
    interpretationUrl: item.description
      ? `https://www.artic.edu/artworks/${item.id}`
      : null,
    museum: "Art Institute of Chicago",
    department: item.department_title,
    city: "Chicago",
    country: "United States",
    imageUrl: `${iiifBaseUrl}/full/1686,/0/default.jpg`,
    thumbUrl: `${iiifBaseUrl}/full/400,/0/default.jpg`,
    iiifBaseUrl,
    colorHex: hslToHex(item.color),
    creditLine: item.credit_line,
    provenance: item.provenance_text,
    isPublicDomain: Boolean(item.is_public_domain),
    tags: item.term_titles ?? [],
  });
};

/**
 * Classifications worth surfacing. The unfiltered catalogue is dominated by
 * prints and photographs, so we ask for paintings and sculpture explicitly.
 */
const CLASSIFICATIONS = ["painting", "sculpture"] as const;

const PER_PAGE = 100;

/** Pull one classification, paging until we have `limit` records. */
const fetchClassification = async (
  classification: string,
  limit: number,
  onProgress: (count: number) => void,
): Promise<NormalisedArtwork[]> => {
  const collected: NormalisedArtwork[] = [];

  for (let page = 1; collected.length < limit; page += 1) {
    const url =
      `https://api.artic.edu/api/v1/artworks/search` +
      `?query[match][classification_title]=${encodeURIComponent(classification)}` +
      `&fields=${FIELDS}&limit=${PER_PAGE}&page=${page}`;

    const body = await fetchJson<AicPage>(url);
    if (!body?.data?.length) break;

    collected.push(
      ...body.data.map(toArtwork).filter((a): a is NormalisedArtwork => a !== null),
    );
    onProgress(collected.length);

    if (page >= body.pagination.total_pages) break;
  }

  return collected.slice(0, limit);
};

/** Fetch an even split of paintings and sculpture from the Art Institute. */
export const fetchArtInstitute = async (limit: number): Promise<NormalisedArtwork[]> => {
  const perClassification = Math.ceil(limit / CLASSIFICATIONS.length);
  const collected: NormalisedArtwork[] = [];

  for (const classification of CLASSIFICATIONS) {
    const works = await fetchClassification(classification, perClassification, (count) =>
      process.stdout.write(`\r  Art Institute: ${collected.length + count} works`),
    );
    collected.push(...works);
  }

  process.stdout.write(`\r  Art Institute: ${collected.length} works\n`);
  return collected;
};
