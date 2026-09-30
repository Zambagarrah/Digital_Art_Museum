import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server with only the node_modules
  // it actually needs, which is what the Dockerfile ships.
  output: "standalone",

  // File tracing follows `import`/`require`, so it misses the query engine the
  // Prisma client resolves by path at runtime. Ship the whole generated client.
  outputFileTracingIncludes: {
    "/**": ["./src/generated/prisma/**"],
  },

  // Prisma's runtime probes the filesystem with paths the tracer cannot resolve
  // statically, which makes it pull the project root into the bundle. Keep the
  // local database and scratch dirs out of it. (`.env` is not listed here on
  // purpose — Next copies env files into standalone by design and ignores this
  // setting for them; .dockerignore and the Dockerfile handle those instead.)
  outputFileTracingExcludes: {
    "/**": ["./prisma/*.db", "./.qodo/**"],
  },

  images: {
    // Museum APIs serve imagery straight from their own CDNs.
    remotePatterns: [
      { protocol: "https", hostname: "www.artic.edu" },
      { protocol: "https", hostname: "images.metmuseum.org" },
      { protocol: "https", hostname: "collectionapi.metmuseum.org" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "commons.wikimedia.org" },
    ],
  },
};

export default nextConfig;
