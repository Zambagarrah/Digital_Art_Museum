#!/bin/sh
set -e

# Fail loudly here rather than letting every request die on an opaque Prisma
# initialisation error.
if [ -z "$DATABASE_URL" ]; then
  echo "docker-entrypoint: DATABASE_URL is not set." >&2
  exit 1
fi

# Schema changes are applied deliberately with `npm run db:push` from a machine
# that can reach the database — not automatically on boot, which would race
# across replicas and can alter a live schema unattended.

exec "$@"
