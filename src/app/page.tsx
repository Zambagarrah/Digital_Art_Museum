import Link from "next/link";
import type { Metadata } from "next";
import { ArtworkGrid } from "@/components/ArtworkCard";
import { CATEGORY_LABELS } from "@/lib/artwork";
import { imageSrc } from "@/lib/images";
import { getFeatured } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Every Masterpiece, One Quiet Room",
  description:
    "Explore paintings, sculptures, historical artifacts, and monuments from the world's open museum collections.",
};

// Rendered per request so the production image can be built without a reachable
// database; `getFeatured` is cached for an hour, so this still serves from
// cache in practice.
export const dynamic = "force-dynamic";

const EmptyState = () => (
  <div className="mx-auto max-w-xl px-6 py-32 text-center">
    <h1 className="font-serif text-3xl text-foreground">The gallery is empty</h1>
    <p className="mt-4 text-sm leading-relaxed text-muted">
      No works have been ingested yet. The catalogue brings together paintings,
      sculptures, historical artifacts and monuments from open museum collections.
    </p>
    <pre className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface px-4 py-3 text-left text-xs text-accent">
      npm run db:seed
    </pre>
  </div>
);

export default async function HomePage() {
  const { highlights, monuments, counts, total } = await getFeatured();

  if (total === 0) return <EmptyState />;

  const heroWorks = highlights.filter((work) => work.thumbUrl).slice(0, 4);

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

        {heroWorks.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {heroWorks.map((work) => (
              <Link
                key={work.id}
                href={`/artwork/${work.slug}`}
                className="group relative block aspect-5/4 overflow-hidden border border-border bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc(work.thumbUrl) ?? work.thumbUrl!}
                  alt={work.title}
                  className="h-full w-full object-contain p-1 transition-transform duration-500 group-hover:scale-[1.03] sm:p-2"
                />
                <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-2 pb-2 pt-7 sm:px-3 sm:pb-3">
                  <h2 className="truncate font-serif text-xs text-white sm:text-sm">
                    {work.title}
                  </h2>
                  <p className="mt-0.5 truncate text-[10px] text-white/75 sm:text-xs">
                    {work.artistName ?? work.museum}
                  </p>
                </div>
              </Link>
            ))}
          </div>
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
