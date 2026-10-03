import { formatPrice, formatYear } from "./artwork";

/** Statements read from Wikidata by `npm run db:facts`, resolved to labels. */
export type WikidataFacts = {
  depicts: string[];
  genres: string[];
  movements: string[];
  architects: string[];
  commissionedBy: string[];
  madeIn: string[];
  locatedIn: string[];
  exhibitions: string[];
  events: { label: string; year: number | null }[];
  owners: {
    name: string;
    start: number | null;
    end: number | null;
    endCause: string | null;
  }[];
};

export type ProvenanceEvent = {
  year: number | null;
  text: string;
  detail: string | null;
  href: string | null;
};

export type Provenance = {
  source: "museum" | "wikidata";
  events: ProvenanceEvent[];
  notes: string[];
};

/** The catalogue fields a narrative draws on; an `Artwork` row satisfies it. */
export type NarrativeRecord = {
  category: string;
  classification: string | null;
  artistName: string | null;
  dateText: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  culture: string | null;
  museum: string | null;
  department: string | null;
  city: string | null;
  country: string | null;
  creditLine: string | null;
  provenance: string | null;
  source: string;
  salePrice: number | null;
  saleCurrency: string | null;
  saleDate: string | null;
  saleYear: number | null;
  saleSourceUrl: string | null;
};

const LIST_KEYS = [
  "depicts",
  "genres",
  "movements",
  "architects",
  "commissionedBy",
  "madeIn",
  "locatedIn",
  "exhibitions",
] as const;

export const emptyFacts = (): WikidataFacts => ({
  depicts: [],
  genres: [],
  movements: [],
  architects: [],
  commissionedBy: [],
  madeIn: [],
  locatedIn: [],
  exhibitions: [],
  events: [],
  owners: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const yearValue = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) ? value : null;

const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Read stored facts defensively; a malformed row degrades to no facts. */
export const parseWikidataFacts = (
  raw: string | null | undefined,
): WikidataFacts | null => {
  if (!raw) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;

  const facts = emptyFacts();
  for (const key of LIST_KEYS) {
    facts[key] = array(data[key]).flatMap((item) => text(item) ?? []);
  }

  facts.events = array(data.events).flatMap((item) => {
    if (!isRecord(item)) return [];
    const label = text(item.label);
    return label ? [{ label, year: yearValue(item.year) }] : [];
  });

  facts.owners = array(data.owners).flatMap((item) => {
    if (!isRecord(item)) return [];
    const name = text(item.name);
    return name
      ? [
          {
            name,
            start: yearValue(item.start),
            end: yearValue(item.end),
            endCause: text(item.endCause),
          },
        ]
      : [];
  });

  return facts;
};

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

const list = (items: readonly string[], max: number) => {
  const unique = [...new Set(items)];
  const shown = unique.slice(0, max);
  return listFormat.format(unique.length > max ? [...shown, "others"] : shown);
};

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const lowerFirst = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);
const trimEnd = (value: string) => value.trim().replace(/[\s.;,:]+$/, "");
const sentence = (value: string) => (/[.!?]["”’)]?$/.test(value) ? value : `${value}.`);
const yearLabel = (year: number) => formatYear(year, year) ?? String(year);

const ordinal = (n: number) => {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

const centuryOf = (year: number) => Math.max(1, Math.ceil(Math.abs(year) / 100));

/** 0–99, counting from the start of the century; BCE centuries run backwards. */
const positionInCentury = (year: number) => {
  const century = centuryOf(year);
  return year < 0 ? century * 100 + year : year - (century - 1) * 100 - 1;
};

/** "the mid-18th century", "the 7th–4th centuries BCE". */
export const centuryPhrase = (start: number | null, end: number | null): string | null => {
  if (start === null) return null;
  const last = end ?? start;
  if (last < start || start < -10000 || last > 2100) return null;

  const first = centuryOf(start);
  const final = centuryOf(last);
  const era = start < 0 ? " BCE" : "";

  if ((start < 0) !== (last < 0)) {
    return `the ${ordinal(first)} century BCE to the ${ordinal(final)} century CE`;
  }
  if (first !== final) return `the ${ordinal(first)}–${ordinal(final)} centuries${era}`;
  if (last - start > 25) return `the ${ordinal(first)} century${era}`;

  const position = positionInCentury(Math.round((start + last) / 2));
  const part = position < 33 ? "early " : position < 66 ? "mid-" : "late ";
  return `the ${part}${ordinal(first)} century${era}`;
};

const UNDATED = /^(undated|n\.?\s?d\.?|date unknown|unknown)$/i;
const NEEDS_ARTICLE = /^(early|mid|middle|late|\d{1,2}(st|nd|rd|th)\b|\d{2,4}s\b)/i;

const datePhrase = (record: NarrativeRecord): string | null => {
  const raw =
    record.dateText && !UNDATED.test(record.dateText.trim())
      ? record.dateText.trim()
      : formatYear(record.yearStart, record.yearEnd);
  if (!raw) return null;

  const date = NEEDS_ARTICLE.test(raw) ? `the ${raw}` : raw;
  if (/centur/i.test(raw)) return date;

  const century = centuryPhrase(record.yearStart, record.yearEnd);
  return century ? `${date}, in ${century}` : date;
};

const KIND: Record<string, string> = {
  painting: "painting",
  sculpture: "sculpture",
  artifact: "object",
  monument: "site",
};

// Some sources file anonymous antiquities under a culture rather than a maker.
const NOT_A_MAKER = /^(ancient|unknown|anonymous|unidentified)\b/i;
const MUSEUM_SOURCES = new Set(["aic", "met", "cleveland"]);
const INSTITUTION =
  /\b(museum|museo|mus[eé]e|museu|gallery|galleria|galerie|institute|collection|library|foundation|rijksmuseum|louvre|uffizi|hermitage|mauritshuis|nationalmuseum|prado)/i;

const withArticle = (name: string) => {
  if (/^the\s/i.test(name)) return name;
  if (/^private collection$/i.test(name)) return "a private collection";
  return INSTITUTION.test(name) ? `the ${name}` : name;
};

const STATE =
  /^(united\b|netherlands$|philippines$|bahamas$|gambia$)|\b(republic|kingdom|empire|states|emirates|islands)\b/i;

const placeWithArticle = (name: string) =>
  !/^the\s/i.test(name) && STATE.test(name) ? `the ${name}` : name;

const identity = (record: NarrativeRecord): string[] => {
  const kind = KIND[record.category] ?? "work";
  const maker =
    record.artistName && !NOT_A_MAKER.test(record.artistName) ? record.artistName : null;
  const when = datePhrase(record);
  const sentences: string[] = [];

  if (maker && when) sentences.push(`This ${kind} by ${maker} dates to ${when}`);
  else if (maker) sentences.push(`This ${kind} is by ${maker}`);
  else if (when) sentences.push(`This ${kind} dates to ${when}`);

  if (record.culture && record.category !== "monument") {
    sentences.push(`Its recorded origin is ${record.culture.trim()}`);
  }

  if (record.source === "wikidata" && record.category === "monument") {
    sentences.push(
      `It is listed as a UNESCO World Heritage Site${record.country ? ` in ${placeWithArticle(record.country)}` : ""}`,
    );
    if (record.classification && record.classification.toLowerCase() !== "monument") {
      sentences.push(`Its recorded architectural style is ${record.classification}`);
    }
  }

  return sentences.map(sentence);
};

const context = (record: NarrativeRecord, facts: WikidataFacts | null): string[] => {
  if (!facts) return [];

  const events = [...facts.events]
    .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity))
    .map((event) =>
      event.year === null ? event.label : `${event.label} (${yearLabel(event.year)})`,
    );

  const sentences = [
    facts.depicts.length ? `Its depicted subjects include ${list(facts.depicts, 6)}` : null,
    facts.genres.length ? `Its genre is listed as ${list(facts.genres, 3)}` : null,
    facts.movements.length ? `It is associated with ${list(facts.movements, 3)}` : null,
    facts.architects.length === 1 ? `It was designed by ${facts.architects[0]}` : null,
    facts.architects.length > 1
      ? `Its recorded architects include ${list(facts.architects, 3)}`
      : null,
    facts.commissionedBy.length
      ? `It was commissioned by ${list(facts.commissionedBy, 3)}`
      : null,
    facts.madeIn.length
      ? `It was made in ${list(facts.madeIn.map(placeWithArticle), 2)}`
      : null,
    facts.locatedIn.length && record.category === "monument"
      ? `It is located in ${list(facts.locatedIn.map(placeWithArticle), 2)}`
      : null,
    facts.exhibitions.length
      ? `It has been exhibited in ${list(facts.exhibitions, 3)}`
      : null,
    events.length ? `Its recorded history includes ${list(events, 4)}` : null,
  ].filter((value): value is string => value !== null);

  if (!sentences.length) return [];
  sentences[0] = `According to Wikidata, ${lowerFirst(sentences[0])}`;
  return sentences.map(sentence);
};

const provenanceSummary = (provenance: Provenance) => {
  const years = provenance.events.flatMap((event) => (event.year === null ? [] : [event.year]));
  const first = Math.min(...years);
  const last = Math.max(...years);
  const count = provenance.events.length;
  // A single date is only stated when every event carries it.
  const span = !years.length
    ? ""
    : first !== last
      ? ` between ${yearLabel(first)} and ${yearLabel(last)}`
      : years.length === count
        ? `, dated ${yearLabel(first)}`
        : "";

  return provenance.source === "museum"
    ? `Its published provenance records ${count} ${count === 1 ? "stage" : "stages"} of ownership${span}`
    : `Wikidata records ${count} ${count === 1 ? "event" : "events"} in its ownership history${span}`;
};

const holdings = (record: NarrativeRecord, provenance: Provenance | null): string[] => {
  const sentences: string[] = [];

  if (record.museum && record.category !== "monument") {
    const museum = record.museum.trim();
    const holder = withArticle(museum);

    if (MUSEUM_SOURCES.has(record.source)) {
      const city = record.city && !museum.includes(record.city) ? ` in ${record.city}` : "";
      const department = !record.department
        ? ""
        : /department/i.test(record.department)
          ? `, in the ${record.department}`
          : `, in the ${record.department} department`;
      sentences.push(`It is held by ${holder}${city}${department}`);
    } else {
      sentences.push(
        holder === "a private collection"
          ? "Wikidata places it in a private collection"
          : `Wikidata places it in the collection of ${holder}`,
      );
    }
  }

  if (record.creditLine && MUSEUM_SOURCES.has(record.source)) {
    sentences.push(`Its credit line reads “${trimEnd(record.creditLine)}”`);
  }

  if (provenance) sentences.push(provenanceSummary(provenance));

  return sentences.map(sentence);
};

/**
 * Compose a catalogue summary that only restates sourced fields, so it never
 * invents an attribution, date, subject or owner.
 */
export const describeArtwork = (
  record: NarrativeRecord,
  facts: WikidataFacts | null,
  provenance: Provenance | null,
): { paragraphs: string[]; usesWikidata: boolean } => {
  const parts = [identity(record), context(record, facts), holdings(record, provenance)];

  // A lone sentence would only repeat the byline above it.
  if (parts.reduce((count, part) => count + part.length, 0) < 2) {
    return { paragraphs: [], usesWikidata: false };
  }

  return {
    paragraphs: parts.filter((part) => part.length > 0).map((part) => part.join(" ")),
    usesWikidata: parts[1].length > 0 || provenance?.source === "wikidata",
  };
};

const NOTE = /^(\[\d+\]|\(\d+\)|notes?\b|footnotes?\b|references?\b)/i;
const ABBREVIATION =
  /(?:^|[\s(.])(?:mme|mlle|mm|mr|mrs|ms|dr|st|ste|jr|sr|co|inc|ltd|bros|no|nos|vol|ca|cf|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|[a-z])$/i;
const YEAR = /\b(1\d{3}|20\d{2})\b/;

const isUpperLetter = (char: string | undefined) =>
  Boolean(char) && char !== char!.toLowerCase() && char === char!.toUpperCase();

/** Provenance convention: `;` marks a direct transfer, `. ` a documented gap. */
const splitEntries = (block: string): string[] => {
  const entries: string[] = [];
  let depth = 0;
  let current = "";

  for (let index = 0; index < block.length; index += 1) {
    const char = block[index];
    if (char === "(" || char === "[") depth += 1;
    else if ((char === ")" || char === "]") && depth > 0) depth -= 1;

    if (depth === 0 && char === ";") {
      entries.push(current);
      current = "";
      continue;
    }

    current += char;
    const next = /^\s+(\S)/.exec(block.slice(index + 1))?.[1];
    if (
      depth === 0 &&
      char === "." &&
      isUpperLetter(next) &&
      !ABBREVIATION.test(current.slice(0, -1))
    ) {
      entries.push(current);
      current = "";
    }
  }

  entries.push(current);
  return entries.map((entry) => entry.trim()).filter(Boolean);
};

/** The transfer year, ignoring bracketed citations and parenthetical life dates. */
const entryYear = (entry: string): number | null => {
  const outsideBrackets = entry.replace(/\[[^\]]*\]/g, " ");
  const bare = outsideBrackets.replace(/\([^)]*\)/g, " ");
  const match = YEAR.exec(bare) ?? YEAR.exec(outsideBrackets);
  return match ? Number(match[1]) : null;
};

const museumProvenance = (value: string): Provenance | null => {
  const blocks = value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const chain = blocks.filter((block) => !NOTE.test(block));
  const notes = chain.length ? blocks.filter((block) => NOTE.test(block)) : [];

  // Cleveland publishes one stage per line; others run a chain into one paragraph.
  const entries = (chain.length ? chain : blocks).flatMap((block) =>
    block.includes("\n")
      ? block
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : splitEntries(block),
  );

  if (!entries.length) return null;

  return {
    source: "museum",
    events: entries.map((entry) => ({
      year: entryYear(entry),
      text: capitalise(entry),
      detail: null,
      href: null,
    })),
    notes,
  };
};

const saleDateLabel = (date: string | null) => {
  // Year-precision Wikidata dates arrive as 1 January, which would overstate them.
  if (!date || date.endsWith("-01-01")) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
};

const wikidataProvenance = (
  record: NarrativeRecord,
  facts: WikidataFacts,
): Provenance | null => {
  if (!facts.owners.length) return null;

  const timeline: { key: number; event: ProvenanceEvent }[] = facts.owners.map((owner) => ({
    key: owner.start ?? owner.end ?? Number.POSITIVE_INFINITY,
    event: {
      year: owner.start,
      text: owner.name,
      detail:
        [
          owner.end === null ? null : `Until ${yearLabel(owner.end)}`,
          owner.endCause ? capitalise(owner.endCause) : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      href: null,
    },
  }));

  const price = formatPrice(record.salePrice, record.saleCurrency);
  if (price) {
    const year = record.saleYear ?? (Number(record.saleDate?.slice(0, 4)) || null);
    timeline.push({
      key: year ?? Number.POSITIVE_INFINITY,
      event: {
        year,
        text: `Sold for ${price}`,
        detail: saleDateLabel(record.saleDate),
        href: record.saleSourceUrl,
      },
    });
  }

  return {
    source: "wikidata",
    events: timeline.sort((a, b) => a.key - b.key).map((item) => item.event),
    notes: [],
  };
};

/** Museum provenance wins; Wikidata ownership statements fill in where none is published. */
export const buildProvenance = (
  record: NarrativeRecord,
  facts: WikidataFacts | null,
): Provenance | null =>
  (record.provenance ? museumProvenance(record.provenance) : null) ??
  (facts ? wikidataProvenance(record, facts) : null);
