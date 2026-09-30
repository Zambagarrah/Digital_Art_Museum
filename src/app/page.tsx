import Link from "next/link";
import { ArtworkGrid } from "@/components/ArtworkCard";
import { CATEGORY_LABELS } from "@/lib/artwork";
import { imageSrc } from "@/lib/images";
import { getFeatured } from "@/lib/queries";

// Rendered per request so the production image can be built without a reachable
// database; `getFeatured` is cached for an hour, so this still serves from
// cache in practice.
export const dynamic = "force-dynamic";

const EmptyState = () => (
  <div className="mx-auto max-w-xl px-6 py-32 text-center">
    <h1 className="font-serif text-3xl text-foreground">The gallery is empty</h1>
    <p className="mt-4 text-sm leading-relaxed text-muted">
      No works have been ingested yet. Run the seed script to pull paintings,
      sculptures and monuments from the Art Institute of Chicago, the
      Metropolitan Museum of Art and Wikidata.
    </p>
    <pre className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface px-4 py-3 text-left text-xs text-accent">
      npm run db:seed
    </pre>
  </div>
);

export default async function HomePage() {
  const { highlights, monuments, counts, total } = await getFeatured();

  if (total === 0) return <EmptyState />;

  const hero = highlights[0];

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-10">
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent">
            {total.toLocaleString()} works in the catalogue
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-[1.1] text-foreground sm:text-6xl">
            Every masterpiece,
            <br />
            one quiet room.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted">
            Browse paintings, sculptures and the monuments humanity built to
            outlast itself &mdash; aggregated from the world&apos;s open museum
            archives and presented without clutter.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/browse"
              className="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-[#14120c] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Enter the collection
            </Link>
            {Object.entries(counts).map(([category, count]) => (
              <Link
                key={category}
                href={`/browse?category=${category}`}
                className="rounded-full border border-border px-5 py-2.5 text-sm text-muted transition hover:border-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}
                <span className="ml-2 text-xs tabular-nums opacity-60">{count}</span>
              </Link>
            ))}
          </div>
        </div>

        {hero?.thumbUrl && (
          <Link
            href={`/artwork/${hero.slug}`}
            className="group relative block overflow-hidden rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc(hero.thumbUrl) ?? hero.thumbUrl}
              alt={hero.title}
              className="h-[420px] w-full object-cover transition duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-6">
              <h2 className="font-serif text-xl text-foreground">{hero.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {hero.artistName ?? hero.museum}
                {hero.dateText ? ` \u00b7 ${hero.dateText}` : ""}
              </p>
            </div>
          </Link>
        )}
      </section>

      <section className="mt-20">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-serif text-2xl text-foreground">Highlights</h2>
          <Link href="/browse" className="text-sm text-accent hover:underline">
            See all
          </Link>
        </div>
        <ArtworkGrid artworks={highlights} />
      </section>

      {monuments.length > 0 && (
        <section className="mt-20">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="font-serif text-2xl text-foreground">Monuments</h2>
            <Link
              href="/browse?category=monument"
              className="text-sm text-accent hover:underline"
            >
              See all
            </Link>
          </div>
          <ArtworkGrid artworks={monuments} />
        </section>
      )}
    </div>
  );
}
