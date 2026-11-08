import "server-only";

/**
 * Pexels photo search (https://www.pexels.com/api/). Photos on Pexels may be
 * used commercially for free; we record the photographer as a courtesy.
 * The key lives only on the server (PEXELS_API_KEY).
 */
export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  alt: string;
  photographer: string;
  pageUrl: string;
  thumb: string;
  large: string;
}

const API = process.env.PEXELS_API_BASE ?? "https://api.pexels.com/v1";

function key(): string {
  const k = process.env.PEXELS_API_KEY;
  if (!k) throw new Error("PEXELS_NOT_CONFIGURED");
  return k;
}

type RawPhoto = {
  id: number; width: number; height: number; alt: string; url: string; photographer: string;
  src: { medium: string; large2x: string; landscape: string; original: string };
};

const toPhoto = (p: RawPhoto): PexelsPhoto => ({
  id: p.id, width: p.width, height: p.height, alt: p.alt ?? "", photographer: p.photographer, pageUrl: p.url,
  thumb: p.src.medium,
  // ~1880px wide, 4:3-ish crop from Pexels' resizer; plenty for a 1080p kiosk.
  large: p.src.large2x,
});

export async function searchPexels(query: string): Promise<PexelsPhoto[]> {
  const url = `${API}/search?${new URLSearchParams({ query, orientation: "landscape", per_page: "12" })}`;
  const res = await fetch(url, { headers: { Authorization: key() }, cache: "no-store" });
  if (res.status === 401) throw new Error("PEXELS_BAD_KEY");
  if (!res.ok) throw new Error(`PEXELS_${res.status}`);
  const body = (await res.json()) as { photos: RawPhoto[] };
  return body.photos.map(toPhoto);
}

/** Looks a photo up by id on Pexels itself, so the browser cannot supply its own URL. */
export async function getPexelsPhoto(id: number): Promise<PexelsPhoto> {
  const res = await fetch(`${API}/photos/${id}`, { headers: { Authorization: key() }, cache: "no-store" });
  if (!res.ok) throw new Error(`PEXELS_${res.status}`);
  return toPhoto((await res.json()) as RawPhoto);
}
