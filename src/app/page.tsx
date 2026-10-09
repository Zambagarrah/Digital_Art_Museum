import Link from "next/link";
import type { Metadata } from "next";
import { ArtworkGrid } from "@/components/ArtworkCard";
import { CASTLES_COLLECTION, CATEGORY_LABELS, formatYear } from "@/lib/artwork";
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
  const { highlights, monuments, castles, counts, total } = await getFeatured();

  if (total === 0) return <EmptyState />;

  const heroWork = highlights[0];
  const heroYear = heroWork?.dateText ?? formatYear(heroWork?.yearStart, heroWork?.yearEnd);
  const supportingWorks = highlights.filter((work) => work.id !== heroWork?.id).slice(0, 3);
  const categories = Object.entries(counts).filter(([, count]) => count > 0);

  return (
    <>
      <section className="home-hero">
        {heroWork && (
          <div className="home-hero-backdrop" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc(heroWork.thumbUrl) ?? heroWork.thumbUrl!} alt="" />
          </div>
        )}
        <div className="home-hero-content mx-auto max-w-[1600px] px-6 py-8 sm:py-12">
          <div className="home-showcase">
            <div className="home-showcase-grid">
              {heroWork && (
                <Link
                  href={`/artwork/${heroWork.slug}`}
                  className="home-feature-visual group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                  aria-label={`View ${heroWork.title}${heroWork.artistName ? ` by ${heroWork.artistName}` : ""}`}
                >
                  <div className="home-feature-image" style={{ backgroundColor: heroWork.colorHex ?? "var(--surface)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageSrc(heroWork.thumbUrl) ?? heroWork.thumbUrl!}
                      alt={heroWork.title}
                      fetchPriority="high"
                    />
                    <span className="home-feature-label">
                      <span className="home-feature-kicker">On view</span>
                      <span className="home-feature-title">{heroWork.title}</span>
                      <span className="home-feature-byline">
                        {heroWork.artistName ?? heroWork.museum ?? "Unattributed"}
                        {heroYear ? ` · ${heroYear}` : ""}
                      </span>
                    </span>
                  </div>
                </Link>
              )}

              <div className="home-showcase-story">
                <p className="home-eyebrow">A world of art, gathered</p>
                <h1 className="home-title">
                  Every masterpiece,
                  <br />
                  one quiet room.
                </h1>
                <p className="home-intro">
                  Explore paintings, sculpture, artifacts and places that have
                  shaped how we see the world, gathered from open museum collections.
                </p>

                {supportingWorks.length > 0 && (
                  <div className="home-work-reel" aria-label="More works from the collection">
                    {supportingWorks.map((work) => (
                      <Link
                        key={work.id}
                        href={`/artwork/${work.slug}`}
                        className="home-reel-item group"
                        aria-label={`View ${work.title}${work.artistName ? ` by ${work.artistName}` : ""}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageSrc(work.thumbUrl) ?? work.thumbUrl!}
                          alt=""
                          loading="lazy"
                        />
                        <span>{work.title}</span>
                      </Link>
                    ))}
                  </div>
                )}

                <div className="home-showcase-actions">
                  <Link href="/browse" className="home-primary-action">
                    Explore the collection <span aria-hidden>&#8599;</span>
                  </Link>
                  <span className="home-work-count">{total.toLocaleString()} works in the archive</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <nav aria-label="Browse by category" className="home-category-nav border-b border-border">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-8 gap-y-3 px-6 py-5">
          <span className="mr-2 text-[10px] uppercase tracking-[0.18em] text-muted">
            Explore
          </span>
          {categories.map(([category, count]) => (
            <Link
              key={category}
              href={`/browse?category=${category}`}
              className="border-b border-transparent pb-1 text-sm text-foreground/75 transition hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}
              <span className="ml-2 text-xs tabular-nums text-muted">{count}</span>
            </Link>
          ))}
        </div>
      </nav>

      <div className="home-archive mx-auto max-w-[1600px] px-6 py-16 sm:py-20">
        <section>
          <div className="mb-7 flex items-end justify-between gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-accent">Selected from the archive</p>
              <h2 className="mt-2 font-serif text-3xl text-foreground">Highlights</h2>
            </div>
            <Link href="/browse" className="shrink-0 border-b border-accent/60 pb-1 text-sm text-accent hover:text-foreground">
              View all works <span aria-hidden>&#8594;</span>
            </Link>
          </div>
          <ArtworkGrid artworks={highlights} />
        </section>

        {monuments.length > 0 && (
          <section className="mt-20">
            <div className="mb-7 flex items-end justify-between gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-accent">Places made to endure</p>
                <h2 className="mt-2 font-serif text-3xl text-foreground">Monuments</h2>
              </div>
              <Link
                href="/browse?category=monument"
                className="shrink-0 border-b border-accent/60 pb-1 text-sm text-accent hover:text-foreground"
              >
                View all <span aria-hidden>&#8594;</span>
              </Link>
            </div>
            <ArtworkGrid artworks={monuments} />
          </section>
        )}

        {castles.length > 0 && (
          <section className="mt-20">
            <div className="mb-7 flex items-end justify-between gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-accent">Across centuries and borders</p>
                <h2 className="mt-2 font-serif text-3xl text-foreground">{CASTLES_COLLECTION}</h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
                  Medieval strongholds, royal residences and romantic revivals,
                  led by the castles most widely documented across Wikipedia.
                </p>
              </div>
              <Link
                href={`/browse?museum=${encodeURIComponent(CASTLES_COLLECTION)}`}
                className="shrink-0 border-b border-accent/60 pb-1 text-sm text-accent hover:text-foreground"
              >
                View all <span aria-hidden>&#8594;</span>
              </Link>
            </div>
            <ArtworkGrid artworks={castles} />
          </section>
        )}
      </div>
    </>
  );
}
