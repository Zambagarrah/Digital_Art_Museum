import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArtworkGrid } from "@/components/ArtworkCard";
import { ArtworkViewer } from "@/components/ArtworkViewer";
import { Prose } from "@/components/Prose";
import { formatPrice, formatYear } from "@/lib/artwork";
import { getArtwork } from "@/lib/queries";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { slug } = await params;
  const result = await getArtwork(slug);
  if (!result) return { title: "Not found · Digital Art Museum" };

  const { artwork } = result;
  const byline = artwork.artistName ?? artwork.museum ?? "Digital Art Museum";

  return {
    title: `${artwork.title} · ${byline}`,
    description: artwork.description ?? `${artwork.title} by ${byline}.`,
    openGraph: artwork.thumbUrl ? { images: [artwork.thumbUrl] } : undefined,
  };
};

const Detail = ({ label, value }: { label: string; value: string | null }) =>
  value ? (
    <div className="grid grid-cols-[110px_1fr] gap-4 border-b border-border py-3">
      <dt className="text-xs uppercase tracking-widest text-muted">{label}</dt>
      <dd className="text-sm leading-relaxed text-foreground">{value}</dd>
    </div>
  ) : null;

export default async function ArtworkPage({ params }: Props) {
  const { slug } = await params;
  const result = await getArtwork(slug);

  if (!result) notFound();

  const { artwork, related } = result;
  const year = artwork.dateText ?? formatYear(artwork.yearStart, artwork.yearEnd);
  const place = [artwork.city, artwork.country].filter(Boolean).join(", ") || null;
  const price = formatPrice(artwork.salePrice, artwork.saleCurrency);

  return (
    <article className="mx-auto max-w-[1600px] px-6 py-10">
      <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <ArtworkViewer
          title={artwork.title}
          imageUrl={artwork.imageUrl ?? artwork.thumbUrl}
          iiifBaseUrl={artwork.iiifBaseUrl}
          backgroundColor={artwork.colorHex}
          framed={artwork.category === "painting"}
        />

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent">
            {artwork.category}
          </p>

          <h1 className="mt-3 font-serif text-3xl leading-tight text-foreground sm:text-4xl">
            {artwork.title}
          </h1>

          {artwork.artistName && (
            <p className="mt-3 text-lg text-muted">
              <Link
                href={`/browse?artist=${encodeURIComponent(artwork.artistName)}`}
                className="transition-colors hover:text-accent"
              >
                {artwork.artistName}
              </Link>
              {year ? <span className="text-muted">{` \u00b7 ${year}`}</span> : null}
            </p>
          )}

          {!artwork.artistName && year && (
            <p className="mt-3 text-lg text-muted">{year}</p>
          )}

          {artwork.description && (
            <p className="mt-6 text-sm leading-relaxed text-muted">
              {artwork.description}
            </p>
          )}

          {price && (
            <section className="mt-8 rounded-lg border border-border bg-surface p-5">
              <h2 className="text-xs uppercase tracking-widest text-muted">
                Last recorded sale
              </h2>
              <p className="mt-2 font-serif text-3xl text-accent">{price}</p>
              {artwork.saleDate && (
                <p className="mt-1 text-sm text-muted">
                  {new Date(artwork.saleDate).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-muted">
                The price this work fetched when it last changed hands, not a
                current valuation or appraisal.
                {artwork.saleSourceUrl && (
                  <>
                    {" "}
                    <a
                      href={artwork.saleSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:underline"
                    >
                      Source
                    </a>
                  </>
                )}
              </p>
            </section>
          )}

          <dl className="mt-8">
            <Detail label="Medium" value={artwork.medium} />
            <Detail label="Dimensions" value={artwork.dimensions} />
            <Detail label="Culture" value={artwork.culture} />
            <Detail label="Type" value={artwork.classification} />
            <Detail label="Location" value={place} />
            <Detail label="Collection" value={artwork.museum} />
            <Detail label="Department" value={artwork.department} />
            <Detail label="Credit" value={artwork.creditLine} />
          </dl>

          {artwork.interpretation && (
            <section className="mt-10">
              <h2 className="font-serif text-xl text-foreground">
                About this work
              </h2>
              <Prose text={artwork.interpretation} className="mt-4" />
              {artwork.interpretationSource && (
                <p className="mt-4 text-xs text-muted">
                  {artwork.interpretationUrl ? (
                    <a
                      href={artwork.interpretationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:underline"
                    >
                      {artwork.interpretationSource}
                    </a>
                  ) : (
                    artwork.interpretationSource
                  )}
                </p>
              )}
            </section>
          )}

          {artwork.provenance && (
            <details className="group mt-10 border-t border-border pt-6">
              <summary className="cursor-pointer list-none font-serif text-xl text-foreground transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                Provenance
                <span className="ml-2 text-sm font-sans text-muted group-open:hidden">
                  show
                </span>
                <span className="ml-2 hidden text-sm font-sans text-muted group-open:inline">
                  hide
                </span>
              </summary>
              <p className="mt-3 text-xs text-muted">
                Ownership history as published by {artwork.museum ?? "the source"}.
              </p>
              <Prose text={artwork.provenance} className="mt-4" />
            </details>
          )}

          {artwork.latitude != null && artwork.longitude != null && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${artwork.latitude}&mlon=${artwork.longitude}#map=13/${artwork.latitude}/${artwork.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex text-sm text-accent hover:underline"
            >
              View on the map &rarr;
            </a>
          )}

          {artwork.tags.length > 0 && (
            <ul className="mt-8 flex flex-wrap gap-2">
              {artwork.tags.map(({ tag }) => (
                <li key={tag.id}>
                  <Link
                    href={`/browse?q=${encodeURIComponent(tag.name)}`}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-foreground"
                  >
                    {tag.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {artwork.sourceUrl && (
            <p className="mt-8 text-xs text-muted">
              Record from{" "}
              <a
                href={artwork.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                {artwork.museum ?? artwork.source}
              </a>
              {artwork.isPublicDomain ? " · Public domain" : ""}
            </p>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-24">
          <h2 className="mb-6 font-serif text-2xl text-foreground">Related works</h2>
          <ArtworkGrid artworks={related} />
        </section>
      )}
    </article>
  );
}
