import { planBatches } from "@/lib/batches";
import type { AdBrief, BriefReference } from "@/lib/types";

type ReferenceSummary = { reference: string; prompt: string | null };

/** Per-group creative breakdown in the shape described in the spec's Step 3. */
export type CreativeBreakdown = {
  format: "static";
  copy: "separated" | "in-image";
  copy_text: string | null;
  dimensions: AdBrief["dimensions"];
  product: string;
  brand: string;
  product_visibility: AdBrief["productVisibility"];
  keywords: string[];
  landing_pages: string[];
  group: number | null;
  variations: number;
  style_references: ReferenceSummary[];
  format_references: ReferenceSummary[];
  pairings: { style: string | null; format: string | null; variations: number }[];
};

const summarize = (r: BriefReference): ReferenceSummary => ({
  reference: r.fileName,
  prompt: r.prompt.trim() || null,
});

export function toCreativeBreakdowns(brief: AdBrief, brandId: string): CreativeBreakdown[] {
  const base = {
    format: "static" as const,
    copy: brief.copyMode === "separate" ? ("separated" as const) : ("in-image" as const),
    copy_text: brief.copyMode === "in-image" && brief.copy.trim() ? brief.copy.trim() : null,
    dimensions: brief.dimensions,
    product: brief.products.map((p) => p.sku).join(", "),
    brand: brandId,
    product_visibility: brief.productVisibility,
    keywords: brief.keywords,
    landing_pages: brief.landingPages.map((lp) => lp.title),
  };

  const batches = planBatches(brief);
  if (batches.length === 0) {
    return [
      {
        ...base,
        group: null,
        variations: brief.targetAds,
        style_references: [],
        format_references: [],
        pairings: [],
      },
    ];
  }

  return batches.map((b) => {
    const refs = brief.references.filter((r) => r.groupId === b.id);
    return {
      ...base,
      group: b.index + 1,
      variations: b.count,
      style_references: refs.filter((r) => r.role === "style").map(summarize),
      format_references: refs.filter((r) => r.role === "format").map(summarize),
      pairings: b.jobs.map((j) => ({
        style: j.style?.fileName ?? null,
        format: j.format?.fileName ?? null,
        variations: j.count,
      })),
    };
  });
}
