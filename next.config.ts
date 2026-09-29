import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
