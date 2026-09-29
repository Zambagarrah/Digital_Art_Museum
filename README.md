# Digital Art Museum

A browsable catalogue of the world's paintings, sculptures and monuments,
aggregated from open museum archives and presented as one quiet, image-first
gallery.

## What's here

- **Browse & search** across every object with faceted filters (type,
  collection, era) and five sort orders.
- **Artwork pages** with full wall-label metadata, click-to-zoom imagery
  (IIIF-backed where the source supports it) and related works.
- **Context & provenance** — curatorial or encyclopedic prose explaining each
  work, plus ownership history where the museum publishes it.
- **Aggregation pipeline** that normalises records from five public APIs into
  a single local catalogue.

## Sources

| Source | Coverage | Key required |
| --- | --- | --- |
| [Art Institute of Chicago](https://api.artic.edu/docs/) | Paintings, sculpture, decorative arts | No |
| [Metropolitan Museum of Art](https://metmuseum.github.io/) | Encyclopedic collection | No |
| [Wikidata](https://query.wikidata.org/) | UNESCO World Heritage monuments | No |
| [Wikidata](https://query.wikidata.org/) | Canonical paintings from the great collections | No |
| [Wikidata (P2284)](https://query.wikidata.org/) | Paintings with a public auction record | No |

## Choosing the canon

The museum APIs return whatever their search ranks highest, which skews toward
whatever is well catalogued rather than what matters. A fifth source fills the
obvious gaps — the Mona Lisa, the Ghent Altarpiece, Guernica — by asking
Wikidata for paintings held in the world's great collections or made by the
canonical painters, ranked by how many language Wikipedias cover them.

Sitelink count is a blunt proxy for cultural reach, but an honest one: the Mona
Lisa has articles in 146 languages, a minor still life in one.

Two details make it work. Canonical paintings are often not typed `painting` —
The Last Supper is a `fresco`, the Ghent Altarpiece a `polyptych`, The Scream a
`group of paintings` — so several types are matched. And a work's collection is
usually a *department* rather than the museum (the Mona Lisa belongs to the
Louvre's painting department), so the `part of` chain is followed before
matching.

## On prices

Museum-held works have no market price. They are inalienable, never offered for
sale, and no institution publishes an appraisal — so this catalogue **does not
estimate or invent valuations**.

Instead it shows two things that are real:

- **Provenance and credit line** — the documented ownership chain and how the
  museum acquired the work, for the ~830 objects where that is published.
- **Last recorded sale** — an actual hammer price, shown only for the 96
  paintings that carry a cited public auction record in Wikidata, each linked
  back to its source. This is presented as a historical sale, never as a current
  valuation or appraisal.

Sorting by *Highest sale* filters to those priced works, since the rest have no
price to rank by.

## Getting started

```bash
npm install
npm run db:push     # create the SQLite schema
npm run db:seed     # pull ~2,100 works from the public APIs
npm run dev
```

Then open http://localhost:3000.

The seed script accepts per-source limits:

```bash
npm run db:seed -- --aic=3000 --met=1500 --monuments=800 --market=200 --masterpieces=400
```

It upserts on `(source, sourceId)`, so re-running it refreshes existing records
rather than duplicating them, then prunes rows a source no longer returns so the
catalogue mirrors the latest ingest.

### Context enrichment

The Art Institute publishes curatorial descriptions; the Met and Wikidata do
not. For those, the seed resolves each object's Wikidata id to an English
Wikipedia article and stores its lead section. Museum prose always wins — a
curator writing about their own holding beats a general encyclopedia.

Because this depends on a third-party API mid-run, it can be re-run on its own
without re-fetching the museum sources:

```bash
npm run db:enrich
```


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
  enrich.ts           Re-runs the Wikipedia context pass over existing rows
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
