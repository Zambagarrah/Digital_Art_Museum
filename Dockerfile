# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1


FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci


FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
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

# Copy the FULL node_modules so prisma CLI has all its wasm/binary files,
# then overwrite the generated prisma client with the one from deps.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nextjs:nodejs /app/prisma ./prisma

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN rm -f .env .env.*

RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next

USER nextjs
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
