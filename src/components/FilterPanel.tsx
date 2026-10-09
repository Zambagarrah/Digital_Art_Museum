import Link from "next/link";
import { CATEGORY_LABELS, isCategory } from "@/lib/artwork";
import { buildHref, type BrowseQuery } from "@/lib/queries";

type Facet = { value: string; count: number };

type Props = {
  query: BrowseQuery;
  categories: Facet[];
  museums: Facet[];
};

const FacetLink = ({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) => (
  <li>
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`facet-row flex items-baseline justify-between gap-3 rounded px-2 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active
          ? "bg-surface-raised text-accent"
          : "text-muted hover:bg-surface hover:text-foreground"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted">{count}</span>
    </Link>
  </li>
);

const FacetChip = ({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count?: number;
  active: boolean;
}) => (
  <Link
    href={href}
    aria-current={active ? "page" : undefined}
    className={`facet-chip inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
      active
        ? "border-accent bg-surface-raised text-accent"
        : "border-border text-muted hover:border-accent hover:text-foreground"
    }`}
  >
    {label}
    {count !== undefined && <span className="tabular-nums opacity-60">{count}</span>}
  </Link>
);

const ERAS = [
  { label: "Ancient", from: -3000, to: 400 },
  { label: "Medieval", from: 400, to: 1400 },
  { label: "Renaissance", from: 1400, to: 1600 },
  { label: "Baroque", from: 1600, to: 1750 },
  { label: "19th century", from: 1800, to: 1900 },
  { label: "Modern", from: 1900, to: 2025 },
] as const;

export const FilterPanel = ({ query, categories, museums }: Props) => {
  const hasFilters =
    query.q ||
    query.category ||
    query.museum ||
    query.artist ||
    query.from !== null ||
    query.to !== null;

  return (
    <aside aria-label="Filters" className="filter-panel space-y-8">
      {hasFilters && (
        <Link
          href={buildHref(query, {
            category: null,
            museum: null,
            artist: null,
            q: "",
            from: null,
            to: null,
            page: null,
          })}
          className="inline-flex text-xs uppercase tracking-widest text-accent hover:underline"
        >
          Clear filters
        </Link>
      )}

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-widest text-muted">Type</h2>
        <ul className="flex flex-wrap gap-2">
          {categories.map((facet) => (
            <li key={facet.value}>
              <FacetChip
                href={buildHref(query, {
                  category: query.category === facet.value ? null : facet.value,
                  page: null,
                })}
                label={
                  isCategory(facet.value) ? CATEGORY_LABELS[facet.value] : facet.value
                }
                count={facet.count}
                active={query.category === facet.value}
              />
            </li>
          ))}
        </ul>
      </section>

      {museums.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs uppercase tracking-widest text-muted">Collection</h2>
          <ul className="space-y-0.5">
            {museums.map((facet) => (
              <FacetLink
                key={facet.value}
                href={buildHref(query, {
                  museum: query.museum === facet.value ? null : facet.value,
                  page: null,
                })}
                label={facet.value}
                count={facet.count}
                active={query.museum === facet.value}
              />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-widest text-muted">Era</h2>
        <ul className="flex flex-wrap gap-2">
          {ERAS.map((era) => {
            const active = query.from === era.from && query.to === era.to;
            return (
              <li key={era.label}>
                <FacetChip
                  href={buildHref(query, {
                    from: active ? null : era.from,
                    to: active ? null : era.to,
                    page: null,
                  })}
                  label={era.label}
                  active={active}
                >
                </FacetChip>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
};
