import { emptyFacts, type WikidataFacts } from "../../src/lib/narrative";
import { fetchJson, sleep } from "./shared";

const API = "https://www.wikidata.org/w/api.php";

/** `wbgetentities` accepts up to 50 ids per anonymous request. */
const BATCH = 50;

/** Wikimedia asks API clients to send requests in series, with a pause. */
const GAP_MS = 1000;

const LISTS = {
  depicts: ["P180", "P921"],
  genres: ["P136"],
  movements: ["P135"],
  architects: ["P84"],
  commissionedBy: ["P88"],
  madeIn: ["P1071"],
  locatedIn: ["P131"],
  exhibitions: ["P608"],
} as const;

type ListKey = keyof typeof LISTS;

type Snak = { snaktype?: string; datavalue?: { type?: string; value?: unknown } };

type Statement = {
  rank?: string;
  mainsnak?: Snak;
  qualifiers?: Record<string, Snak[] | undefined>;
};

type Entity = {
  missing?: string;
  redirects?: { from?: string };
  claims?: Record<string, Statement[] | undefined>;
  labels?: Record<string, { value?: string } | undefined>;
};

type EntitiesResponse = { entities?: Record<string, Entity> };

/** Statements keep their item ids until the labels are fetched. */
type RawFacts = {
  lists: Record<ListKey, string[]>;
  events: { id: string; year: number | null }[];
  owners: {
    id: string | null;
    start: number | null;
    end: number | null;
    endCause: string | null;
  }[];
};

const chunk = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

const itemId = (snak: Snak | undefined): string | null => {
  if (snak?.snaktype !== "value" || snak.datavalue?.type !== "wikibase-entityid") return null;
  const value = snak.datavalue.value as { id?: unknown } | undefined;
  return typeof value?.id === "string" ? value.id : null;
};

/** "+1630-00-00T00:00:00Z" -> 1630, "-0500-…" -> -500. */
const timeYear = (snak: Snak | undefined): number | null => {
  if (snak?.snaktype !== "value" || snak.datavalue?.type !== "time") return null;
  const time = (snak.datavalue.value as { time?: unknown } | undefined)?.time;
  const match = typeof time === "string" ? /^([+-])(\d+)-/.exec(time) : null;
  if (!match) return null;
  const year = Number(match[2]) * (match[1] === "-" ? -1 : 1);
  return year === 0 ? null : year;
};

const statements = (entity: Entity, property: string) =>
  (entity.claims?.[property] ?? []).filter((statement) => statement.rank !== "deprecated");

const qualifierYear = (statement: Statement, ...properties: string[]) => {
  for (const property of properties) {
    const year = timeYear(statement.qualifiers?.[property]?.[0]);
    if (year !== null) return year;
  }
  return null;
};

const extract = (entity: Entity): RawFacts => ({
  lists: Object.fromEntries(
    Object.entries(LISTS).map(([key, properties]) => [
      key,
      properties.flatMap((property) =>
        statements(entity, property).flatMap((statement) => itemId(statement.mainsnak) ?? []),
      ),
    ]),
  ) as Record<ListKey, string[]>,
  events: statements(entity, "P793").flatMap((statement) => {
    const id = itemId(statement.mainsnak);
    return id ? [{ id, year: qualifierYear(statement, "P585", "P580") }] : [];
  }),
  // "somevalue" is Wikidata's unknown owner; "novalue" asserts there was none.
  owners: statements(entity, "P127").flatMap((statement) => {
    const id = itemId(statement.mainsnak);
    if (!id && statement.mainsnak?.snaktype !== "somevalue") return [];
    return [
      {
        id,
        start: qualifierYear(statement, "P580", "P585"),
        end: qualifierYear(statement, "P582"),
        endCause: itemId(statement.qualifiers?.P1534?.[0]),
      },
    ];
  }),
});

const referencedIds = (raw: RawFacts) => [
  ...Object.values(raw.lists).flat(),
  ...raw.events.map((event) => event.id),
  ...raw.owners.flatMap((owner) =>
    [owner.id, owner.endCause].filter((id): id is string => id !== null),
  ),
];

const resolve = (raw: RawFacts, labels: ReadonlyMap<string, string | null>): WikidataFacts => {
  const label = (id: string) => labels.get(id) ?? null;
  const facts = emptyFacts();

  for (const key of Object.keys(LISTS) as ListKey[]) {
    facts[key] = [...new Set(raw.lists[key].flatMap((id) => label(id) ?? []))];
  }

  facts.events = raw.events.flatMap((event) => {
    const name = label(event.id);
    return name ? [{ label: name, year: event.year }] : [];
  });

  facts.owners = raw.owners.flatMap((owner) => {
    const name = owner.id === null ? "Unknown owner" : label(owner.id);
    return name
      ? [
          {
            name,
            start: owner.start,
            end: owner.end,
            endCause: owner.endCause ? label(owner.endCause) : null,
          },
        ]
      : [];
  });

  return facts;
};

const fetchEntities = async (ids: readonly string[], props: "claims" | "labels") => {
  await sleep(GAP_MS);

  const url =
    `${API}?action=wbgetentities&ids=${ids.join("|")}&props=${props}` +
    "&languages=en&languagefallback=1&format=json";
  const body = await fetchJson<EntitiesResponse>(url, { timeoutMs: 60_000 });
  if (!body?.entities) return null;

  // Key redirected entities by the id that was requested.
  return new Map(
    Object.entries(body.entities).map(([key, entity]) => [entity.redirects?.from ?? key, entity]),
  );
};

const fetchLabels = async (
  ids: readonly string[],
  cache: Map<string, string | null>,
): Promise<boolean> => {
  for (const batch of chunk(ids.filter((id) => !cache.has(id)), BATCH)) {
    const entities = await fetchEntities(batch, "labels");
    if (!entities) return false;
    for (const id of batch) cache.set(id, entities.get(id)?.labels?.en?.value?.trim() || null);
  }
  return true;
};

/**
 * Yield facts one batch at a time so callers can persist progress. A batch
 * whose claims or labels fail is skipped, leaving it for the next run.
 */
export async function* fetchWikidataFacts(
  qids: readonly string[],
): AsyncGenerator<Map<string, WikidataFacts>> {
  const labels = new Map<string, string | null>();

  for (const batch of chunk(qids, BATCH)) {
    const entities = await fetchEntities(batch, "claims");
    if (!entities) {
      console.warn(`\n  Wikidata: claims batch of ${batch.length} failed`);
      continue;
    }

    const raw = new Map(
      batch.map((qid) => {
        const entity = entities.get(qid);
        return [qid, entity && entity.missing === undefined ? extract(entity) : null] as const;
      }),
    );
    const ids = [
      ...new Set([...raw.values()].flatMap((facts) => (facts ? referencedIds(facts) : []))),
    ];

    if (!(await fetchLabels(ids, labels))) {
      console.warn(`\n  Wikidata: labels for a batch of ${batch.length} failed`);
      continue;
    }

    yield new Map(
      batch.map((qid) => {
        const facts = raw.get(qid);
        return [qid, facts ? resolve(facts, labels) : emptyFacts()];
      }),
    );
  }
}
