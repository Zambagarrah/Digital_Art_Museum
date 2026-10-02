#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "docker-entrypoint: DATABASE_URL is not set." >&2
  exit 1
fi

echo "docker-entrypoint: running prisma db push..."
node ./node_modules/prisma/build/index.js db push --schema=./prisma/schema.prisma --skip-generate
echo "docker-entrypoint: prisma db push complete."

exec "$@"
