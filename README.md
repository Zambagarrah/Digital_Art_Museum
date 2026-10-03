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
- **Aggregation pipeline** that normalises records from six public sources into
  a single local catalogue.

## Sources

| Source | Coverage | Key required |
| --- | --- | --- |
| [Art Institute of Chicago](https://api.artic.edu/docs/) | Paintings, sculpture, decorative arts | No |
| [Metropolitan Museum of Art](https://metmuseum.github.io/) | Encyclopedic collection | No |
| [Cleveland Museum of Art](https://openaccess-api.clevelandart.org/) | CC0 paintings, sculpture, and historical object types | No |
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
- **Last recorded sale** — an actual auction price from a cited Wikidata record,
  linked to a museum record when its Wikidata identifier matches. It is shown as
  a historical sale, never as a current valuation or appraisal.

Sorting by *Highest sale* filters to those priced works, since the rest have no
price to rank by.

## Getting started

The catalogue lives in PostgreSQL. `compose.yaml` provides one for local work:

```bash
cp .env.example .env
docker compose up -d   # Postgres on localhost:5432
npm install
npm run db:push        # create the schema
npm run db:seed        # pull up to ~9,500 works from public sources
npm run dev
```

Then open http://localhost:3000.

If you would rather use a PostgreSQL you already have installed, skip the
`compose` step, create an empty database, and point `DATABASE_URL` at it.

The seed script accepts per-source limits:

```bash
npm run db:seed -- --aic=3000 --met=1500 --cleveland=4000 --monuments=800 --market=200 --masterpieces=400
```

To refresh only the Cleveland Museum's CC0 collection, without waiting for the
Wikidata sources:

```bash
npm run db:cleveland -- --limit=4000
```

Wikidata's query service allows roughly one request a minute and returns nothing
at all when it is busy, so the three Wikidata-backed sources are fetched in
sequence with a pause between them. A full seed takes several minutes, and it is
normal for one source to come back empty — re-run `npm run db:masterpieces` or
`npm run db:enrich` to fill the gap rather than repeating the whole seed.

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

PostgreSQL, via Prisma. The schema deliberately avoids provider-specific types,
so switching back to SQLite for a throwaway local setup is a one-line change in
`prisma/schema.prisma` — though `queries.ts` passes `mode: "insensitive"` on
search, which Postgres needs and SQLite rejects.

## Deployment

The repository ships a multi-stage `Dockerfile` that builds Next.js in
[standalone mode](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
so the runtime image carries only the server, its traced dependencies and the
Prisma query engine. Nothing in the build touches the database — every route is
rendered on demand — so the image builds anywhere.

### Dokploy

1. **Push the repository** to GitHub, GitLab or any Git remote Dokploy can read.

2. **Create a Postgres service.** In your project, *Create Service → Database →
   Postgres*. Set a database name, user and password, then deploy it. Its page
   shows the internal hostname; the application container reaches it over
   Dokploy's Docker network, so there is no need to publish a port.

3. **Create the application.** *Create Service → Application*, point it at the
   repository and branch, then under *Build Type* choose **Dockerfile** with
   path `Dockerfile` and context `.`.

4. **Set the environment variable** in the application's *Environment* tab:

   ```text
   DATABASE_URL=postgresql://USER:PASSWORD@INTERNAL_HOSTNAME:5432/DATABASE
   ```

   The container refuses to start without it rather than failing one request at
   a time.

5. **Add a domain.** In *Domains*, add the hostname, set the container port to
   **3000**, and enable HTTPS so Traefik issues a certificate.

6. **Deploy.**

7. **Create the schema and load the catalogue.** The runtime image deliberately
   contains no Prisma CLI and no seed scripts, so this is done once from your
   machine. Temporarily give the Postgres service an external port in Dokploy,
   then:

   ```bash
   export DATABASE_URL="postgresql://USER:PASSWORD@SERVER_IP:5432/DATABASE"
   npm run db:push
   npm run db:seed
   ```

   Remove the external port again when the seed finishes. Repeat `db:push`
   after any change to `prisma/schema.prisma`.

### Health checks and rollbacks

`GET /api/health` runs a query, so it reports 503 when the database is
unreachable instead of claiming health because the process is up. Wire it into
*Advanced → Cluster Settings → Swarm Settings*:

```json
{
  "Test": ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
  "Interval": 30000000000,
  "Timeout": 10000000000,
  "StartPeriod": 40000000000,
  "Retries": 3
}
```

The check runs `node` rather than `curl`, which the slim base image does not
carry. Pair it with an update config so a bad release backs itself out:

```json
{ "Parallelism": 1, "Delay": 10000000000, "FailureAction": "rollback", "Order": "start-first" }
```

Run a single replica. Nothing in the app coordinates schema changes between
instances, and the on-disk ISR cache is per-container.

### Notes

- Building on the same server that runs your apps is memory-hungry and can stall
  a small VPS. If that bites, build the image in CI and have Dokploy deploy the
  published tag instead — Dokploy's
  [Going Production](https://docs.dokploy.com/docs/core/applications/going-production)
  guide covers the webhook.
- `.dockerignore` keeps `.env` and local `*.db` files out of the build context,
  and the Dockerfile deletes any env file that reaches the image anyway: Next
  copies `.env` into the standalone output by design, and that output is copied
  wholesale into the final stage.
- The base image pins Debian **bookworm** to match the `debian-openssl-3.0.x`
  Prisma engine target in `prisma/schema.prisma`. Moving to trixie (OpenSSL 3.5)
  means changing both together.

## Roadmap

- Timeline view — scrub through centuries and watch style evolve
- World map of monuments, with clustering
- Curated collections ("Vermeer's 34 paintings", "Gothic cathedrals")
- Dedicated search engine (Meilisearch) for typo tolerance and instant facets
- Colour and visual-similarity search

## Attribution

Images and metadata remain the property of the contributing institutions.
Records link back to their source.
