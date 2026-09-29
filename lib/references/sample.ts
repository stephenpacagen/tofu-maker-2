import type { ReferenceMetrics } from "@/lib/types";
import type { LibraryAd, LibraryBrand, LibraryPlatform, LibraryQuery } from "./library";

type Layout = "split" | "testimonial" | "headline" | "scene" | "beforeAfter" | "listicle" | "ugc" | "comparison";

const bar = (x: number, y: number, w: number, h: number, fill: string, r = 6) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;

const LAYOUTS: Record<Layout, (fg: string, accent: string) => string> = {
  split: (fg, accent) =>
    bar(0, 0, 200, 500, fg, 0) + bar(230, 60, 140, 18, accent) + bar(230, 90, 110, 12, accent) + bar(250, 300, 100, 150, accent, 14),
  testimonial: (fg, accent) =>
    `<text x="40" y="120" font-size="120" font-family="Georgia" fill="${accent}">“</text>` +
    bar(40, 150, 320, 16, fg) + bar(40, 178, 300, 16, fg) + bar(40, 206, 260, 16, fg) +
    `<circle cx="70" cy="300" r="30" fill="${accent}"/>` + bar(115, 290, 120, 12, fg) +
    `<text x="40" y="400" font-size="28" fill="${accent}">★★★★★</text>`,
  headline: (fg, accent) =>
    bar(40, 60, 320, 42, fg) + bar(40, 112, 260, 42, fg) + bar(40, 180, 180, 14, accent) + bar(120, 260, 160, 200, accent, 16),
  scene: (fg, accent) =>
    `<circle cx="300" cy="110" r="50" fill="${accent}" opacity="0.6"/>` + bar(0, 340, 400, 160, fg, 0) +
    bar(170, 250, 60, 110, accent, 10) + bar(40, 40, 160, 16, fg),
  beforeAfter: (fg, accent) =>
    bar(20, 60, 170, 380, fg, 12) + bar(210, 60, 170, 380, accent, 12) +
    bar(60, 450, 90, 14, fg) + bar(250, 450, 90, 14, accent),
  listicle: (fg, accent) =>
    bar(40, 50, 260, 30, fg) +
    [0, 1, 2, 3].map((i) => `<circle cx="60" cy="${150 + i * 80}" r="16" fill="${accent}"/>` + bar(95, 142 + i * 80, 240 - i * 25, 16, fg)).join(""),
  ugc: (fg, accent) =>
    bar(30, 30, 340, 440, fg, 24) + `<circle cx="200" cy="200" r="70" fill="${accent}" opacity="0.8"/>` +
    bar(70, 380, 260, 36, "#ffffff", 18) + bar(90, 393, 180, 10, fg),
  comparison: (fg, accent) =>
    bar(40, 40, 320, 24, fg) +
    [0, 1, 2, 3].map((i) => bar(40, 110 + i * 70, 150, 44, fg, 8) + bar(210, 110 + i * 70, 150, 44, accent, 8)).join(""),
};

function placeholderCreative(layout: Layout, bg: string, fg: string, accent: string, brand: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="800" height="1000">` +
    `<rect width="400" height="500" fill="${bg}"/>${LAYOUTS[layout](fg, accent)}` +
    `<text x="380" y="488" text-anchor="end" font-family="sans-serif" font-size="12" fill="${fg}" opacity="0.6">${brand}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Offline fallback when no library provider is configured. Brands and metrics are made up.
const SAMPLE_ADS: {
  id: string;
  brand: string;
  category: string;
  headline: string;
  description: string;
  platforms: LibraryPlatform[];
  startedAt: string;
  layout: Layout;
  colors: [string, string, string];
  metrics: Omit<ReferenceMetrics, "platformCount">;
}[] = [
  {
    id: "sample-lumen-split",
    brand: "Lumen Skin",
    category: "Skincare",
    headline: "Split screen",
    description: "Product on the right, lifestyle crop on the left, one-line benefit up top.",
    platforms: ["facebook", "instagram"],
    startedAt: "2026-05-02",
    layout: "split",
    colors: ["#f6efe8", "#d9b8a0", "#8a5a44"],
    metrics: { runDays: 148, isActive: true },
  },
  {
    id: "sample-barkly-testimonial",
    brand: "Barkly",
    category: "Pet care",
    headline: "Testimonial",
    description: "Big pull-quote from a pet owner with a star rating and avatar.",
    platforms: ["facebook", "instagram", "tiktok"],
    startedAt: "2026-06-18",
    layout: "testimonial",
    colors: ["#fff8e6", "#2f2a24", "#e0a526"],
    metrics: { runDays: 96, isActive: true },
  },
  {
    id: "sample-northwind-headline",
    brand: "Northwind Coffee",
    category: "Food & drink",
    headline: "Big headline",
    description: "Two-line bold claim above a small product shot on a flat color.",
    platforms: ["facebook"],
    startedAt: "2026-07-30",
    layout: "headline",
    colors: ["#1f3b2d", "#f2e9d8", "#c77d3a"],
    metrics: { runDays: 61, isActive: true },
  },
  {
    id: "sample-hearth-scene",
    brand: "Hearth Home",
    category: "Home",
    headline: "Product in scene",
    description: "Warm living-room scene where the product sits naturally on a shelf.",
    platforms: ["facebook", "instagram"],
    startedAt: "2026-04-11",
    layout: "scene",
    colors: ["#f3e6d6", "#b08968", "#7f5539"],
    metrics: { runDays: 170, isActive: true },
  },
  {
    id: "sample-aura-before-after",
    brand: "Aura Sleep",
    category: "Wellness",
    headline: "Before / after",
    description: "Side-by-side of a restless night and a calm morning, no product focus.",
    platforms: ["facebook", "instagram", "tiktok", "youtube"],
    startedAt: "2026-03-22",
    layout: "beforeAfter",
    colors: ["#e8ecf6", "#5b6b8c", "#a3b8e0"],
    metrics: { runDays: 188, isActive: false },
  },
  {
    id: "sample-sprout-listicle",
    brand: "Sprout Kids",
    category: "Family",
    headline: "Listicle",
    description: "Four reasons parents switched, numbered bullets on a soft background.",
    platforms: ["facebook", "instagram"],
    startedAt: "2026-08-05",
    layout: "listicle",
    colors: ["#eef7ee", "#2e5e3e", "#7cc48a"],
    metrics: { runDays: 44, isActive: true },
  },
  {
    id: "sample-peak-ugc",
    brand: "Peak Protein",
    category: "Fitness",
    headline: "UGC-style",
    description: "Selfie-style frame with a caption bubble, reads like an organic post.",
    platforms: ["tiktok"],
    startedAt: "2026-06-01",
    layout: "ugc",
    colors: ["#111827", "#374151", "#f97316"],
    metrics: { runDays: 112, isActive: true },
  },
  {
    id: "sample-tidy-comparison",
    brand: "Tidy Co",
    category: "Home",
    headline: "Comparison",
    description: "Us vs. them table with four rows, brand column in the accent color.",
    platforms: ["facebook", "youtube"],
    startedAt: "2026-07-14",
    layout: "comparison",
    colors: ["#f8fafc", "#334155", "#0ea5e9"],
    metrics: { runDays: 75, isActive: true },
  },
];

const SAMPLE_LIBRARY: LibraryAd[] = SAMPLE_ADS.map(({ layout, colors, metrics, ...ad }) => ({
  ...ad,
  imageUrl: placeholderCreative(layout, ...colors, ad.brand),
  metrics: { ...metrics, platformCount: ad.platforms.length },
}));

const brandId = (name: string) => `sample-${name.toLowerCase().replace(/\W+/g, "-")}`;

export function sampleAds({ q, brandId: brand, platform, liveOnly, minRunDays }: LibraryQuery) {
  const terms = (q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return SAMPLE_LIBRARY.filter((ad) => !brand || brandId(ad.brand) === brand)
    .filter((ad) => !platform || ad.platforms.includes(platform))
    .filter((ad) => !liveOnly || ad.metrics.isActive)
    .filter((ad) => !minRunDays || (ad.metrics.runDays ?? 0) >= minRunDays)
    .filter((ad) => {
      const haystack = `${ad.brand} ${ad.category} ${ad.headline} ${ad.description}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
}

export function sampleBrands(q: string): LibraryBrand[] {
  const names = [...new Set(SAMPLE_LIBRARY.map((ad) => ad.brand))];
  return names
    .filter((name) => name.toLowerCase().includes(q.toLowerCase()))
    .map((name) => {
      const ads = SAMPLE_LIBRARY.filter((ad) => ad.brand === name);
      return {
        id: brandId(name),
        name,
        adsCount: ads.length,
        activeAdsCount: ads.filter((ad) => ad.metrics.isActive).length,
      };
    });
}
