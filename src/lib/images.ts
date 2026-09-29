/**
 * Hosts whose imagery must be fetched server-side.
 *
 * The Art Institute's IIIF endpoint sits behind bot protection that rejects
 * cross-origin hotlinks, so its images are routed through `/api/image`.
 * Everything else is loaded straight from the source CDN.
 */
export const PROXIED_HOSTS = new Set(["www.artic.edu"]);

/** Resolve a stored image URL to something the browser can actually load. */
export const imageSrc = (url: string | null | undefined): string | null => {
  if (!url) return null;

  try {
    const { hostname } = new URL(url);
    return PROXIED_HOSTS.has(hostname)
      ? `/api/image?src=${encodeURIComponent(url)}`
      : url;
  } catch {
    return null;
  }
};
