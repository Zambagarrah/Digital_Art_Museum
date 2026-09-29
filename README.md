# Digital Art Museum

A browsable catalogue of the world's paintings, sculptures and monuments,
aggregated from open museum archives and presented as one quiet, image-first
gallery.

## What's here

- **Browse & search** across every object with faceted filters (type,
  collection, era) and four sort orders.
- **Artwork pages** with full wall-label metadata, click-to-zoom imagery
  (IIIF-backed where the source supports it) and related works.
- **Aggregation pipeline** that normalises records from three public APIs into
  a single local catalogue.

## Sources

| Source | Coverage | Key required |
| --- | --- | --- |
| [Art Institute of Chicago](https://api.artic.edu/docs/) | Paintings, sculpture, decorative arts | No |
| [Metropolitan Museum of Art](https://metmuseum.github.io/) | Encyclopedic collection | No |
| [Wikidata](https://query.wikidata.org/) | UNESCO World Heritage monuments | No |

## Getting started

```bash
npm install
npm run db:push     # create the SQLite schema
npm run db:seed     # pull ~2,000 works from the public APIs
npm run dev
```

Then open http://localhost:3000.

The seed script accepts per-source limits:

```bash
npm run db:seed -- --aic=3000 --met=1500 --monuments=800
```

It upserts on `(source, sourceId)`, so re-running it refreshes existing records
rather than duplicating them.

## Architecture

```
src/
  app/                Next.js App Router pages (home, browse, artwork detail)
    api/image/        Image proxy for CDNs that block hotlinking
  components/         Presentational components
  lib/
    artwork.ts        Pure helpers: classification, slugs, date parsing
    images.ts         Resolves stored image URLs to loadable ones
    queries.ts        Query construction, facets, pagination
    prisma.ts         Database client singleton
scripts/
  seed.ts             Orchestrates ingestion and persistence
  ingest/             One adapter per source, each normalising to a shared shape
prisma/schema.prisma  Data model
```

Every source adapter returns the same `NormalisedArtwork` shape, so adding a
new museum means writing one file and appending it to the list in `seed.ts`.

### Images

Most sources are loaded straight from their CDN. The Art Institute's IIIF host
sits behind bot protection that rejects cross-origin requests, so those images
are routed through `/api/image`, which re-requests them server-side with the
headers the CDN expects. The route only accepts https URLs on an explicit host
allowlist, so it cannot be used as an open proxy.

## Database

Local development uses SQLite for zero setup. The schema deliberately avoids
provider-specific types, so deploying on Postgres is a one-line change:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

## Roadmap

- Timeline view — scrub through centuries and watch style evolve
- World map of monuments, with clustering
- Curated collections ("Vermeer's 34 paintings", "Gothic cathedrals")
- Dedicated search engine (Meilisearch) for typo tolerance and instant facets
- Colour and visual-similarity search

## Attribution

Images and metadata remain the property of the contributing institutions.
Records link back to their source.
