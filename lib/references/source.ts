import { apifyAds, apifyBrands, hasApifyToken } from "./apify";
import {
  normalizeName,
  sortLibraryAds,
  type LibraryAd,
  type LibraryBrand,
  type LibraryPage,
  type LibraryQuery,
  type LibrarySource,
} from "./library";
import { sampleAds, sampleBrands } from "./sample";
import { scoreReference } from "./score";

export function librarySource(): LibrarySource {
  return process.env.LIBRARY_PROVIDER !== "sample" && hasApifyToken() ? "apify" : "sample";
}

const rank = (ads: LibraryAd[]) => ads.map((ad) => ({ ...ad, score: scoreReference(ad.metrics).score }));

export async function queryLibrary(query: LibraryQuery): Promise<LibraryPage> {
  const source = librarySource();
  const all = sortLibraryAds(rank(source === "apify" ? await apifyAds(query) : sampleAds(query)), query.sort);
  const offset = Number(query.cursor) || 0;
  const end = offset + (query.limit ?? all.length);
  return { ads: all.slice(offset, end), cursor: end < all.length ? String(end) : null, source, total: all.length };
}

export async function searchLibraryBrands(q: string, limit = 8): Promise<LibraryBrand[]> {
  if (librarySource() === "sample") return sampleBrands(q).slice(0, limit);

  const target = normalizeName(q);
  const isExact = (b: LibraryBrand) => normalizeName(b.name) === target;
  return (await apifyBrands(q))
    .sort((a, b) => Number(isExact(b)) - Number(isExact(a)) || b.adsCount - a.adsCount)
    .slice(0, limit);
}
