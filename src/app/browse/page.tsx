import Link from "next/link";
import { ArtworkGrid } from "@/components/ArtworkCard";
import { FilterPanel } from "@/components/FilterPanel";
import { CATEGORY_LABELS, isCategory } from "@/lib/artwork";
import { buildHref, parseQuery, searchArtworks, type SearchParams } from "@/lib/queries";

export const revalidate = 300;

const SORTS = [
  { value: "relevance", label: "Relevance" },
  { value: "oldest", label: "Oldest first" },
  { value: "newest", label: "Newest first" },
  { value: "title", label: "A–Z" },
  { value: "price", label: "Highest sale" },
] as const;

const headingFor = (category: string | null, q: string) => {
  if (q) return `Results for “${q}”`;
  if (category && isCategory(category)) return CATEGORY_LABELS[category];
  return "The collection";
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseQuery(await searchParams);
  const { items, total, pageCount, facets } = await searchArtworks(query);

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-10">
      <header className="mb-8">
        <h1 className="font-serif text-3xl text-foreground">
          {headingFor(query.category, query.q)}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {total.toLocaleString()} {total === 1 ? "work" : "works"}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <FilterPanel
          query={query}
          categories={facets.categories}
          museums={facets.museums}
        />

        <main>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-muted">Sort</span>
            {SORTS.map((option) => (
              <Link
                key={option.value}
                href={buildHref(query, { sort: option.value, page: null })}
                aria-current={query.sort === option.value ? "true" : undefined}
                className={`rounded-full px-3 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  query.sort === option.value
                    ? "bg-surface-raised text-accent"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>

          {items.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-6 py-16 text-center text-sm text-muted">
              Nothing matches those filters yet. Try widening the era or clearing
              the collection filter.
            </p>
          ) : (
            <ArtworkGrid artworks={items} />
          )}

          {pageCount > 1 && (
            <nav
              aria-label="Pagination"
              className="mt-12 flex items-center justify-center gap-4 text-sm"
            >
              {query.page > 1 && (
                <Link
                  href={buildHref(query, { page: query.page - 1 })}
                  className="rounded-full border border-border px-4 py-2 text-muted transition hover:border-accent hover:text-foreground"
                >
                  Previous
                </Link>
              )}
              <span className="tabular-nums text-muted">
                Page {query.page} of {pageCount}
              </span>
              {query.page < pageCount && (
                <Link
                  href={buildHref(query, { page: query.page + 1 })}
                  className="rounded-full border border-border px-4 py-2 text-muted transition hover:border-accent hover:text-foreground"
                >
                  Next
                </Link>
              )}
            </nav>
          )}
        </main>
      </div>
    </div>
  );
}
