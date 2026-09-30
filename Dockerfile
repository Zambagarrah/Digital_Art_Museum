# syntax=docker/dockerfile:1

# Debian bookworm, not Alpine: Prisma's query engine links against glibc and
# OpenSSL 3.0, which is exactly the `debian-openssl-3.0.x` binary target pinned
# in schema.prisma. Bookworm is pinned deliberately — Debian trixie ships
# OpenSSL 3.5 and would need a different engine.
FROM node:24-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1


FROM base AS deps
# `postinstall` runs `prisma generate`, so the schema must be present for `npm ci`.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci


FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma parses this string at build time but never opens a connection, and no
# page is prerendered against the database, so a placeholder is enough.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
ENV NODE_ENV=production
RUN node node_modules/prisma/build/index.js generate && npm run build


FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/home/nextjs

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --home-dir /home/nextjs --create-home nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Next copies .env files into the standalone output by design. .dockerignore
# should have kept them out of the build context entirely, but delete any that
# slipped through rather than bake credentials into a published image.
RUN rm -f .env .env.*

# ISR writes rendered pages here at runtime.
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next

USER nextjs
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
