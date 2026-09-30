// Central QA configuration. Change weights, threshold, critical rules, or the QA
// model's vision detail here; nothing else hardcodes these values.
import type { QACategory, QASeverity } from "./types";

/** Points per category. Should add up to 100; the score is normalized either way. */
export const QA_WEIGHTS: Record<QACategory, number> = {
  productFidelity: 35,
  aspectRatio: 15,
  textSpelling: 20,
  unwantedLogos: 15,
  anatomy: 15,
};

/** Overall score (0-100) at or above which an image passes, absent critical failures. */
export const QA_PASS_THRESHOLD = 85;

/**
 * A failed check whose severity is listed here is a critical failure: it forces
 * overallStatus "fail" regardless of the numeric score. Aspect ratio is scored but
 * never critical by default.
 */
export const QA_CRITICAL_SEVERITIES: Record<QACategory, QASeverity[]> = {
  productFidelity: ["critical"],
  aspectRatio: [],
  textSpelling: ["critical"],
  unwantedLogos: ["critical"],
  anatomy: ["critical"],
};

export const QA_CATEGORY_LABELS: Record<QACategory, string> = {
  productFidelity: "Product Fidelity",
  aspectRatio: "Aspect Ratio",
  textSpelling: "Text & Spelling",
  unwantedLogos: "Outside Logos",
  anatomy: "Anatomy",
};

/** Display order in the UI. */
export const QA_CATEGORIES: QACategory[] = ["productFidelity", "aspectRatio", "textSpelling", "unwantedLogos", "anatomy"];

/**
 * When only an aspect ratio is known (Gemini picks the exact pixels per ratio and size
 * tier), allow this relative difference. Gemini's 9:16 at 1K is 768x1344 (0.571 vs
 * 0.5625, ~1.6% off), so 2% covers its rounding without accepting a different ratio.
 * When exact dimensions are known (OpenAI), they must match exactly.
 */
export const QA_ASPECT_RATIO_TOLERANCE = 0.02;

// QA model settings. Start cheap; switch QA_IMAGE_DETAIL to "high" to test whether
// low-detail vision misses small text or hand defects.
export const QA_MODEL = "gpt-5.6-luna";
export const QA_IMAGE_DETAIL: "low" | "high" | "auto" = "low";
export const QA_REASONING_EFFORT: "low" | "medium" | "high" = "low";
