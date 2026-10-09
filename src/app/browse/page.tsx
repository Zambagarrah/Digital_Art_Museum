import Link from "next/link";
import type { Metadata } from "next";
import { ArtworkGrid } from "@/components/ArtworkCard";
import { FilterPanel } from "@/components/FilterPanel";
import { CATEGORY_LABELS, isCategory } from "@/lib/artwork";
import { buildHref, parseQuery, searchArtworks, type SearchParams } from "@/lib/queries";

export const revalidate = 300;

export const generateMetadata = async ({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> => {
  const query = parseQuery(await searchParams);
  const title = query.q
    ? `Search: ${query.q}`
    : query.category
      ? CATEGORY_LABELS[query.category]
      : query.museum ?? "Browse the collection";
  const description = query.q
    ? `Search paintings, sculptures, artifacts, and monuments for ${query.q}.`
    : query.category
      ? `Browse ${CATEGORY_LABELS[query.category].toLowerCase()} from open museum collections.`
      : query.museum
        ? `Browse ${query.museum} in the Digital Art Museum catalogue.`
        : "Browse and search paintings, sculptures, historical artifacts, and monuments from open museum collections.";

  return { title, description };
};

const SORTS = [
  { value: "relevance", label: "Relevance" },
  { value: "oldest", label: "Oldest first" },
  { value: "newest", label: "Newest first" },
  { value: "title", label: "A–Z" },
  { value: "price", label: "Highest sale" },
] as const;

const headingFor = (category: string | null, q: string, museum: string | null) => {
  if (q) return `Results for “${q}”`;
  if (category && isCategory(category)) return CATEGORY_LABELS[category];
  return museum ?? "The collection";
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseQuery(await searchParams);
  const { items, total, pageCount, facets } = await searchArtworks(query);

  return (
    <div className="browse-page mx-auto max-w-[1600px] px-6 py-10">
      <header className="browse-page-heading mb-8">
        <p className="browse-eyebrow">Digital Art Museum · Archive</p>
        <h1 className="mt-2 font-serif text-3xl text-foreground">
          {headingFor(query.category, query.q, query.museum)}
        </h1>
        <p className="browse-result-count mt-2 text-sm text-muted">
          {total.toLocaleString()} {total === 1 ? "work" : "works"}
        </p>
      </header>

      <div className="browse-layout grid gap-8 lg:grid-cols-[240px_1fr]">
        <FilterPanel
          query={query}
          categories={facets.categories}
          museums={facets.museums}
        />

        <main className="browse-results">
          <div className="browse-toolbar mb-6 flex flex-wrap items-center gap-2">
            <span className="browse-toolbar-label text-xs uppercase tracking-widest text-muted">Sort</span>
            {SORTS.map((option) => (
              <Link
                key={option.value}
                href={buildHref(query, { sort: option.value, page: null })}
                aria-current={query.sort === option.value ? "true" : undefined}
                className={`sort-option rounded-full px-3 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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
            <div className="py-20 text-center">
              <h2 className="font-serif text-2xl text-foreground">No works found</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
                Try a broader search or remove one of the active filters.
              </p>
              {(query.q || query.category || query.museum || query.artist || query.from !== null || query.to !== null) && (
                <Link
                  href={buildHref(query, {
                    q: "",
                    category: null,
                    museum: null,
                    artist: null,
                    from: null,
                    to: null,
                    sort: "relevance",
                    page: null,
                  })}
                  className="mt-5 inline-flex border-b border-accent pb-1 text-sm text-accent hover:text-foreground"
                >
                  Clear search and filters
                </Link>
              )}
            </div>
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
