#!/bin/sh
set -e

# Fail loudly here rather than letting every request die on an opaque Prisma
# initialisation error.
if [ -z "$DATABASE_URL" ]; then
  echo "docker-entrypoint: DATABASE_URL is not set." >&2
  exit 1
fi

# Push the Prisma schema to the database, creating or migrating tables as
# needed. This is idempotent — safe to run on every boot and across replicas
# because `db push` is a no-op when the schema is already in sync.
echo "docker-entrypoint: running prisma db push..."
./node_modules/.bin/prisma db push --schema=./prisma/schema.prisma --skip-generate
echo "docker-entrypoint: prisma db push complete."

exec "$@"
