import type { AdBrief, BriefReference, LandingPage } from "@/lib/types";

type ReferenceSummary = { reference: string; prompt: string | null };

type LandingPageSummary = {
  title: string;
  url: string;
  summary: string;
  key_points: string[];
};

const SKIPPED_HEADINGS = new Set([
  "contents",
  "menu",
  "search",
  "share",
  "related",
  "subscribe",
  "navigation",
]);

type BreakdownBase = {
  format: "static";
  copy: "separated" | "in-image";
  copy_text: string | null;
  dimensions: AdBrief["dimensions"];
  product: string;
  brand: string;
  product_visibility: AdBrief["productVisibility"];
  landing_pages: LandingPageSummary[];
  variations: number;
};

/** Step 1: creative input, before groups and references. */
export type InputBreakdown = BreakdownBase;

/** Keywords sit with the reference group's style and format references. */
export type GroupBreakdown = {
  reference_group: number;
  name: string;
  keywords: string[];
  style_references: ReferenceSummary[];
  format_references: ReferenceSummary[];
};

/** Step 2: the step 1 brief plus each reference group's keywords and references. */
export type ReferenceBreakdown = BreakdownBase & {
  reference_groups: GroupBreakdown[];
};

const summarize = (r: BriefReference): ReferenceSummary => ({
  reference: r.fileName,
  prompt: r.prompt.trim() || null,
});

function clip(text: string, max: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max).replace(/\s+\S*$/, "").trim();
  return `${sliced || clean.slice(0, max).trim()}…`;
}

/** Opening of the article: several sentences, not just the lede. */
function articleSummary(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentences = clean.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [];
  const picked = sentences.slice(0, 6).join(" ").trim() || clean;
  return clip(picked, 1000);
}

function usefulHeading(heading: string, title: string) {
  const key = heading.trim().toLowerCase();
  return key.length > 1 && key !== title.toLowerCase() && !SKIPPED_HEADINGS.has(key);
}

/** Rebuild heading sections from stored page text when the link was added before sections were saved. */
function sectionsFromText(text: string, headings: string[]) {
  const clean = text.replace(/\s+/g, " ").trim();
  const found: { heading: string; index: number }[] = [];
  let cursor = 0;
  for (const heading of headings) {
    const index = clean.toLowerCase().indexOf(heading.toLowerCase(), cursor);
    if (index === -1) continue;
    found.push({ heading, index });
    cursor = index + heading.length;
  }
  return found
    .map((item, i) => {
      const start = item.index + item.heading.length;
      const end = found[i + 1]?.index ?? clean.length;
      return { heading: item.heading, text: clean.slice(start, end).trim() };
    })
    .filter((section) => section.text.length > 0);
}

export function summarizeLandingPage(lp: LandingPage): LandingPageSummary {
  const title = lp.title.trim();
  const stored = lp.sections?.filter((section) => section.heading.trim() && section.text.trim()) ?? [];
  const sections = (stored.length > 0 ? stored : sectionsFromText(lp.text, lp.headings)).filter((section) =>
    usefulHeading(section.heading, title),
  );
  const keyPoints = sections.slice(0, 8).map((section) => {
    const clean = section.text.replace(/\s+/g, " ").trim();
    const sentences = clean.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [];
    const detail = clip(sentences.slice(0, 2).join(" ").trim() || clean, 360);
    return detail ? `${section.heading}: ${detail}` : section.heading;
  });
  const description = lp.description.trim();
  const fromArticle = articleSummary(lp.text);
  const descriptionAlreadyIncluded =
    description.length > 0 && fromArticle.toLowerCase().includes(description.slice(0, 40).toLowerCase());
  const summary = [descriptionAlreadyIncluded ? "" : description, fromArticle].filter(Boolean).join(" ");
  return {
    title,
    url: lp.fileName,
    summary: clip(summary, 1200),
    key_points: keyPoints,
  };
}

function breakdownBase(brief: AdBrief, brandId: string): BreakdownBase {
  return {
    format: "static",
    copy: brief.copyMode === "separate" ? "separated" : "in-image",
    copy_text: brief.copyMode === "in-image" && brief.copy.trim() ? brief.copy.trim() : null,
    dimensions: brief.dimensions,
    product: brief.products.map((p) => p.sku).join(", "),
    brand: brandId,
    product_visibility: brief.productVisibility,
    landing_pages: brief.landingPages.map(summarizeLandingPage),
    variations: brief.targetAds,
  };
}

/** Step 1 only: product, copy, dimensions, and landing pages. References are added in step 2. */
export function toInputBreakdown(brief: AdBrief, brandId: string): InputBreakdown {
  return breakdownBase(brief, brandId);
}

/** Step 2: each reference group carries its own keywords next to its style and format references. */
export function toReferenceBreakdown(brief: AdBrief, brandId: string): ReferenceBreakdown {
  const reference_groups = brief.referenceGroups.map((group, index) => {
    const refs = brief.references.filter((r) => r.groupId === group.id);
    return {
      reference_group: index + 1,
      name: group.name?.trim() || `Reference group ${index + 1}`,
      keywords: group.keywords?.length ? group.keywords : brief.keywords,
      style_references: refs.filter((r) => r.role === "style").map(summarize),
      format_references: refs.filter((r) => r.role === "format").map(summarize),
    };
  });
  return { ...breakdownBase(brief, brandId), reference_groups };
}
