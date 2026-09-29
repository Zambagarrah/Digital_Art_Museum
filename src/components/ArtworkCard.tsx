import Link from "next/link";
import { formatYear } from "@/lib/artwork";
import { imageSrc } from "@/lib/images";
import type { ArtworkCard as ArtworkCardData } from "@/lib/queries";

type Props = {
  artwork: ArtworkCardData;
  priority?: boolean;
};

/**
 * A single work in the grid.
 *
 * A plain `img` is used rather than `next/image` so each card keeps the image's
 * natural aspect ratio — that variety is what makes the masonry layout read as
 * a wall of art rather than a uniform spreadsheet.
 */
export const ArtworkCard = ({ artwork, priority = false }: Props) => {
  const year = artwork.dateText ?? formatYear(artwork.yearStart, artwork.yearEnd);
  const thumb = imageSrc(artwork.thumbUrl);

  return (
    <Link
      href={`/artwork/${artwork.slug}`}
      className="group mb-4 block break-inside-avoid rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      <figure className="overflow-hidden rounded-lg">
        <div
          className="relative w-full overflow-hidden rounded-lg"
          style={{ backgroundColor: artwork.colorHex ?? "var(--surface)" }}
        >
          {thumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={thumb}
              alt={artwork.title}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              className="h-auto w-full opacity-95 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-100"
            />
          ) : (
            <div className="aspect-[4/5] w-full" />
          )}
        </div>

        <figcaption className="px-1 pt-3">
          <h3 className="font-serif text-sm leading-snug text-foreground transition-colors group-hover:text-accent">
            {artwork.title}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {artwork.artistName ?? artwork.museum ?? "Unattributed"}
            {year ? ` · ${year}` : ""}
          </p>
        </figcaption>
      </figure>
    </Link>
  );
};

/** Masonry grid wrapper shared by the landing rails and the browse results. */
export const ArtworkGrid = ({ artworks }: { artworks: ArtworkCardData[] }) => (
  <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
    {artworks.map((artwork, index) => (
      <ArtworkCard key={artwork.id} artwork={artwork} priority={index < 6} />
    ))}
  </div>
);
