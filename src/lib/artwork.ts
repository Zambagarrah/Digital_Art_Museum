/** Categories an object can fall into. Kept as a union of plain strings so the
 *  value round-trips through SQLite and the URL query string unchanged. */
export const CATEGORIES = [
  "painting",
  "sculpture",
  "monument",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  painting: "Paintings",
  sculpture: "Sculptures",
  monument: "Monuments",
  other: "Other works",
};

export const isCategory = (value: string): value is Category =>
  (CATEGORIES as readonly string[]).includes(value);

const PAINTING_HINTS = [
  "painting",
  "oil on",
  "tempera",
  "watercolor",
  "fresco",
  "canvas",
  "panel",
  "acrylic",
  "gouache",
];

const SCULPTURE_HINTS = [
  "sculpture",
  "statue",
  "bust",
  "bronze",
  "marble",
  "relief",
  "carving",
  "terracotta",
  "figurine",
];

const MONUMENT_HINTS = [
  "monument",
  "memorial",
  "temple",
  "cathedral",
  "castle",
  "palace",
  "pyramid",
  "mosque",
  "basilica",
  "obelisk",
  "tomb",
  "fortress",
  "architecture",
];

/** Infer a category from whatever free-text descriptors a source provides. */
export const classify = (...descriptors: (string | null | undefined)[]): Category => {
  const haystack = descriptors.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return "other";

  const matches = (hints: string[]) => hints.some((hint) => haystack.includes(hint));

  if (matches(MONUMENT_HINTS)) return "monument";
  if (matches(SCULPTURE_HINTS)) return "sculpture";
  if (matches(PAINTING_HINTS)) return "painting";
  return "other";
};

/** URL-safe identifier derived from a title, de-duplicated by a short suffix. */
export const slugify = (value: string, suffix?: string): string => {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  const stem = base || "untitled";
  return suffix ? `${stem}-${suffix}` : stem;
};

/**
 * Pull numeric year bounds out of a human-written date.
 *
 * Handles the shapes museum data actually uses: "1503", "c. 1642",
 * "1503–19", "ca. 1300 B.C.", "19th century", "1850-1852".
 */
export const parseYearRange = (
  dateText: string | null | undefined,
): { yearStart: number | null; yearEnd: number | null } => {
  if (!dateText) return { yearStart: null, yearEnd: null };

  const text = dateText.toLowerCase();
  const isBce = /\bb\.?c\.?(e\.?)?\b/.test(text);
  const sign = isBce ? -1 : 1;

  const century = text.match(/(\d{1,2})(?:st|nd|rd|th)\s+century/);
  if (century) {
    const n = Number(century[1]);
    const end = sign * (n * 100);
    const start = sign * ((n - 1) * 100 + 1);
    return isBce
      ? { yearStart: end, yearEnd: start }
      : { yearStart: start, yearEnd: end };
  }

  const years = [...text.matchAll(/\d{1,4}/g)]
    .map((m) => Number(m[0]))
    .filter((n) => n > 0 && n <= 2100);

  if (years.length === 0) return { yearStart: null, yearEnd: null };

  // "1503–19" abbreviates the closing year; expand it against the opener.
  const first = years[0];
  const last = years.length > 1 ? years[years.length - 1] : first;
  const expanded =
    last < first && String(last).length < String(first).length
      ? Number(String(first).slice(0, String(first).length - String(last).length) + String(last))
      : last;

  const a = sign * first;
  const b = sign * expanded;
  return { yearStart: Math.min(a, b), yearEnd: Math.max(a, b) };
};

/** Render a year range the way a wall label would. */
export const formatYear = (
  yearStart: number | null | undefined,
  yearEnd: number | null | undefined,
): string | null => {
  const label = (year: number) =>
    year < 0 ? `${Math.abs(year)} BCE` : String(year);

  if (yearStart == null && yearEnd == null) return null;
  if (yearStart == null) return label(yearEnd!);
  if (yearEnd == null || yearEnd === yearStart) return label(yearStart);
  return `${label(yearStart)}–${label(yearEnd)}`;
};

/** Collapse whitespace and strip markup that leaks out of source descriptions. */
export const cleanText = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const stripped = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || null;
};
