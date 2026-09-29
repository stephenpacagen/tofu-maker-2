import type { ReferenceMetrics } from "@/lib/types";

export const LIBRARY_PLATFORMS = ["facebook", "instagram", "threads", "messenger", "audience_network", "tiktok", "youtube"] as const;
export type LibraryPlatform = (typeof LIBRARY_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<LibraryPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  messenger: "Messenger",
  audience_network: "Audience Network",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export const LIBRARY_SORTS = {
  score: "Highest score",
  longest_running: "Longest running",
  newest: "Newest",
  most_relevant: "Most relevant",
} as const;
export type LibrarySort = keyof typeof LIBRARY_SORTS;

export const PLATFORMS_BY_SOURCE: Record<LibrarySource, readonly LibraryPlatform[]> = {
  apify: ["facebook", "instagram", "threads", "messenger", "audience_network"],
  sample: LIBRARY_PLATFORMS,
};

const byScore = (a: RankedLibraryAd, b: RankedLibraryAd) => (b.score ?? -1) - (a.score ?? -1);

const SORTERS: Record<LibrarySort, ((a: RankedLibraryAd, b: RankedLibraryAd) => number) | null> = {
  score: (a, b) => byScore(a, b) || (b.metrics.runDays ?? 0) - (a.metrics.runDays ?? 0),
  longest_running: (a, b) => (b.metrics.runDays ?? 0) - (a.metrics.runDays ?? 0) || byScore(a, b),
  newest: (a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? "") || byScore(a, b),
  most_relevant: null,
};

// Every order is descending (best, longest, or newest first); "most relevant" keeps the source's order.
export function sortLibraryAds(ads: RankedLibraryAd[], sort: LibrarySort = "score") {
  const sorter = SORTERS[sort];
  return sorter ? [...ads].sort(sorter) : ads;
}

export const LIBRARY_PAGE_SIZE = 12;

export type LibraryAd = {
  id: string;
  brand: string;
  brandId?: string;
  brandAvatar?: string;
  category: string;
  headline: string;
  description: string;
  platforms: LibraryPlatform[];
  startedAt?: string;
  imageUrl: string;
  linkUrl?: string;
  sourceUrl?: string;
  metrics: ReferenceMetrics;
};

export type RankedLibraryAd = LibraryAd & { score: number | null };

export type LibraryQuery = {
  q?: string;
  brandId?: string;
  platform?: LibraryPlatform;
  sort?: LibrarySort;
  liveOnly?: boolean;
  minRunDays?: number;
  cursor?: string;
  limit?: number;
};

export type LibrarySource = "apify" | "sample";

export type LibraryPage = {
  ads: RankedLibraryAd[];
  cursor: string | null;
  source: LibrarySource;
  total: number | null;
};

export const normalizeName = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export type LibraryBrand = { id: string; name: string; avatar?: string; adsCount: number; activeAdsCount: number };
