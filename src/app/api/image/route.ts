import { NextResponse } from "next/server";
import { PROXIED_HOSTS } from "@/lib/images";

export const runtime = "nodejs";

/**
 * Streams artwork imagery from source CDNs that refuse direct hotlinks.
 *
 * The Art Institute's IIIF server sits behind bot protection that rejects
 * requests without a matching `Referer`, so those images cannot be loaded
 * straight from an `img` tag. This route re-issues the request with the headers
 * the CDN expects and passes the bytes through.
 *
 * The host allowlist is what keeps this from being an open proxy.
 */
export const GET = async (request: Request) => {
  const src = new URL(request.url).searchParams.get("src");

  if (!src) {
    return NextResponse.json({ error: "Missing src" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return NextResponse.json({ error: "Invalid src" }, { status: 400 });
  }

  if (target.protocol !== "https:" || !PROXIED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  const upstream = await fetch(target, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      Referer: `${target.origin}/`,
    },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Upstream image unavailable" },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
