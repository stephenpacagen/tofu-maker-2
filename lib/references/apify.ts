import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LibraryAd, LibraryBrand, LibraryPlatform, LibraryQuery } from "./library";

const ACTOR = "automation-lab~facebook-ads-library";
const RUN_URL = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`;
const ADS_PER_RUN = 50;
const MAX_CHARGE_USD_PER_RUN = 0.1;
const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = DAY_MS;
const CACHE_DIR = path.join(process.cwd(), ".cache", "apify");
const STATIC_FORMATS = new Set(["image", "dco", "carousel"]);

type ApifyAd = {
  adArchiveId?: string;
  adId?: string;
  id?: string;
  pageId?: string;
  pageName?: string;
  pageUrl?: string;
  pageProfilePictureUrl?: string;
  pageCategories?: string[];
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
  platforms?: string[];
  title?: string;
  bodyText?: string;
  linkUrl?: string;
  displayFormat?: string;
  imageUrls?: string[];
  videoUrls?: string[];
  collationCount?: number;
};

type ScrapeTarget = { q?: string; pageId?: string; liveOnly: boolean };

// One scrape is shared by every sort/filter/page combination of the same target, so only a
// new keyword, brand, or active-status toggle costs an Apify run. Promises are cached so
// concurrent requests for the same target share a single run; raw results are also written
// to disk so a server restart doesn't pay for the same scrape again.
const cache = new Map<string, { expires: number; ads: Promise<LibraryAd[]> }>();

const cacheFile = (key: string) => path.join(CACHE_DIR, `${createHash("sha1").update(key).digest("hex")}.json`);

async function readDiskCache(key: string): Promise<ApifyAd[] | null> {
  try {
    const { savedAt, items } = JSON.parse(await readFile(cacheFile(key), "utf8"));
    return Date.now() - savedAt < CACHE_TTL_MS ? items : null;
  } catch {
    return null;
  }
}

async function writeDiskCache(key: string, items: ApifyAd[]) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile(key), JSON.stringify({ savedAt: Date.now(), key, items }));
  } catch {
    // Read-only filesystems (serverless) fall back to the in-memory cache.
  }
}

export const hasApifyToken = () => Boolean(process.env.APIFY_TOKEN);

export const proxiedImage = (url: string) => `/api/library/image?url=${encodeURIComponent(url)}`;

function runDays(ad: ApifyAd) {
  if (!ad.startDate) return undefined;
  const end = ad.isActive || !ad.endDate ? Date.now() : Date.parse(ad.endDate);
  return Math.max(0, Math.floor((end - Date.parse(ad.startDate)) / DAY_MS));
}

function toLibraryAd(ad: ApifyAd): LibraryAd | null {
  const image = ad.imageUrls?.[0];
  const id = ad.adArchiveId ?? ad.adId ?? ad.id;
  if (!image || !id) return null;
  const platforms = (ad.platforms ?? []).map((p) => p.toLowerCase()) as LibraryPlatform[];
  return {
    id,
    brand: ad.pageName ?? "Unknown brand",
    brandId: ad.pageId,
    brandAvatar: ad.pageProfilePictureUrl ? proxiedImage(ad.pageProfilePictureUrl) : undefined,
    category: ad.pageCategories?.[0] ?? "",
    headline: ad.title ?? "",
    description: ad.bodyText ?? "",
    platforms,
    startedAt: ad.startDate ? new Date(ad.startDate).toISOString() : undefined,
    imageUrl: proxiedImage(image),
    linkUrl: ad.linkUrl,
    sourceUrl: `https://www.facebook.com/ads/library/?id=${id}`,
    metrics: {
      runDays: runDays(ad),
      isActive: ad.isActive,
      duplicateCount: ad.collationCount === undefined ? undefined : Math.max(0, ad.collationCount - 1),
      platformCount: platforms.length || undefined,
    },
  };
}

async function runActor(target: ScrapeTarget): Promise<ApifyAd[]> {
  const activeStatus = target.liveOnly ? "active" : "all";
  const input = target.pageId
    ? {
        adsLibraryUrls: [
          `https://www.facebook.com/ads/library/?${new URLSearchParams({
            active_status: activeStatus,
            ad_type: "all",
            country: "US",
            media_type: "image_and_meme",
            view_all_page_id: target.pageId,
          })}`,
        ],
        maxAds: ADS_PER_RUN,
      }
    : { searchQueries: [target.q ?? ""], country: "US", activeStatus, mediaType: "image_and_meme", maxAds: ADS_PER_RUN };

  const url = `${RUN_URL}?${new URLSearchParams({ timeout: "240", maxTotalChargeUsd: String(MAX_CHARGE_USD_PER_RUN) })}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(body)) {
    throw new Error(`Apify: ${body?.error?.message ?? res.statusText ?? "scrape failed"}`);
  }
  return body;
}

function toStaticAds(items: ApifyAd[]) {
  const seen = new Set<string>();
  return items
    .filter((ad) => !ad.videoUrls?.length && STATIC_FORMATS.has((ad.displayFormat ?? "image").toLowerCase()))
    .map(toLibraryAd)
    .filter((ad) => ad !== null)
    .filter((ad) => {
      const key = `${ad.brand}|${ad.headline}|${ad.imageUrl}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function scrape(target: ScrapeTarget) {
  const key = JSON.stringify([target.pageId ?? "", (target.q ?? "").trim().toLowerCase(), target.liveOnly]);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.ads;

  const ads = (async () => {
    let items = await readDiskCache(key);
    if (!items) {
      items = await runActor(target);
      await writeDiskCache(key, items);
    }
    return toStaticAds(items);
  })();
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, ads });
  ads.catch(() => cache.delete(key));
  return ads;
}

export async function apifyAds(query: LibraryQuery) {
  const all = await scrape({ q: query.q, pageId: query.brandId, liveOnly: Boolean(query.liveOnly) });

  return all
    .filter((ad) => !query.platform || ad.platforms.includes(query.platform))
    .filter((ad) => !query.minRunDays || (ad.metrics.runDays ?? 0) >= query.minRunDays);
}

// The Ad Library has no brand lookup, so brands are the advertisers behind a keyword search.
export async function apifyBrands(q: string): Promise<LibraryBrand[]> {
  const ads = await scrape({ q, liveOnly: true });
  const brands = new Map<string, LibraryBrand>();
  for (const ad of ads) {
    if (!ad.brandId) continue;
    const brand = brands.get(ad.brandId) ?? {
      id: ad.brandId,
      name: ad.brand,
      avatar: ad.brandAvatar,
      adsCount: 0,
      activeAdsCount: 0,
    };
    brand.adsCount += 1;
    if (ad.metrics.isActive) brand.activeAdsCount += 1;
    brands.set(ad.brandId, brand);
  }
  return [...brands.values()];
}
