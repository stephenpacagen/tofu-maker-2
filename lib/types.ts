export const DIMENSIONS = ["9x16", "4x5", "1x1"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const REFERENCE_ROLES = ["style", "format"] as const;
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];

export const REFERENCE_ROLE_LABELS: Record<ReferenceRole, string> = {
  style: "Style reference",
  format: "Format reference",
};

export const REFERENCE_ROLE_HINTS: Record<ReferenceRole, string> = {
  style: "Copy its look: palette, lighting, typography feel, mood.",
  format: "Copy its layout: composition and element placement.",
};

export type CopyMode = "separate" | "in-image";

/** Top-of-funnel ads never make the product the hero. */
export type ProductVisibility = "secondary" | "none";

/**
 * Publicly observable signals for a reference ad. Every field is optional
 * because availability depends on the source platform.
 */
export type ReferenceMetrics = {
  runDays?: number;
  isActive?: boolean;
  duplicateCount?: number;
  platformCount?: number;
  engagement?: number;
};

export type BriefReference = {
  id: string;
  groupId: string;
  fileName: string;
  source: "upload" | "sourced";
  role: ReferenceRole;
  prompt: string;
  metrics: ReferenceMetrics;
};

export type LandingPage = {
  fileName: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
};

export type AdBrief = {
  brand: string;
  products: { id: string; sku: string; name: string }[];
  productVisibility: ProductVisibility;
  dimensions: Dimension[];
  keywords: string[];
  /** Variations generated for each reference image, in every group. */
  targetAds: number;
  copyMode: CopyMode;
  copy: string;
  landingPages: LandingPage[];
  referenceGroups: { id: string; name?: string }[];
  references: BriefReference[];
};

export type GeneratedAd = {
  id: string;
  batchId: string;
  styleRefId: string | null;
  formatRefId: string | null;
  dimension: Dimension;
  variation: number;
  imageUrl: string;
  prompt: string;
};

/** Cap on images per run (ads × dimensions). */
export const MAX_TOTAL_ADS = 24;
/** Variations the input slider can request for each reference image. */
export const MIN_VARIATIONS_PER_REFERENCE = 1;
export const MAX_VARIATIONS_PER_REFERENCE = 4;
export const MAX_REFERENCE_GROUPS = 8;
