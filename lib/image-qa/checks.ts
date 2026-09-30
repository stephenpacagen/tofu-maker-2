// Deterministic QA: image dimension reading, aspect-ratio validation, and scoring.
// No AI here; the server-calculated score from this file is the source of truth.
import {
  QA_ASPECT_RATIO_TOLERANCE,
  QA_CATEGORIES,
  QA_CATEGORY_LABELS,
  QA_CRITICAL_SEVERITIES,
  QA_PASS_THRESHOLD,
  QA_WEIGHTS,
} from "./config";
import type { QACategory, QACheck, QACheckResult, QAExpectedOutput, QAResult } from "./types";

export type ImageDimensions = { width: number; height: number };

/**
 * Reads width/height from PNG, JPEG, or WebP bytes by parsing the file header.
 * Returns null if the format is unrecognized or the header is malformed.
 */
export function readImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

  // PNG: 8-byte signature, then the IHDR chunk with big-endian width/height.
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(1, 3) === "PNG" && ascii(12, 4) === "IHDR") {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // JPEG: walk the segments until a start-of-frame marker, which holds the dimensions.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xff) {
        offset += 1; // fill byte
        continue;
      }
      const length = view.getUint16(offset + 2);
      const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isStartOfFrame) return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      offset += 2 + length;
    }
    return null;
  }

  // WebP: RIFF container with a VP8 (lossy), VP8L (lossless), or VP8X (extended) chunk.
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 ") {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      const uint24 = (o: number) => bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
      return { width: uint24(24) + 1, height: uint24(27) + 1 };
    }
  }
  return null;
}

const parsePair = (value: string, separator: string) => {
  const [w, h] = value.split(separator).map(Number);
  return w > 0 && h > 0 ? { w, h } : null;
};

/**
 * Deterministic aspect-ratio check. With an exact expected size (OpenAI), the pixels
 * must match exactly. With only a ratio (Gemini, which picks exact pixels itself), the
 * actual ratio must be within QA_ASPECT_RATIO_TOLERANCE of the requested one.
 */
export function validateAspectRatio(dimensions: ImageDimensions | null, expected: QAExpectedOutput): QACheck {
  const expectedLabel = expected.size ?? expected.aspectRatio;
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return {
      status: "error",
      severity: "none",
      description: "Could not read the generated image's dimensions.",
      expected: expectedLabel,
      actual: "unknown",
    };
  }

  const actual = `${dimensions.width}x${dimensions.height}`;
  if (expected.size) {
    const pass = expected.size === actual;
    return {
      status: pass ? "pass" : "fail",
      severity: pass ? "none" : "major",
      description: pass
        ? "Generated image matches the requested dimensions."
        : `Generated image is ${actual}, but ${expected.size} was requested.`,
      expected: expected.size,
      actual,
    };
  }

  const ratio = parsePair(expected.aspectRatio, ":");
  if (!ratio) {
    return {
      status: "error",
      severity: "none",
      description: `Invalid expected aspect ratio "${expected.aspectRatio}".`,
      expected: expected.aspectRatio,
      actual,
    };
  }
  const expectedRatio = ratio.w / ratio.h;
  const actualRatio = dimensions.width / dimensions.height;
  const difference = Math.abs(actualRatio - expectedRatio) / expectedRatio;
  const pass = difference <= QA_ASPECT_RATIO_TOLERANCE;
  const pct = (difference * 100).toFixed(1);
  return {
    status: pass ? "pass" : "fail",
    severity: pass ? "none" : "major",
    description: pass
      ? `Generated image is ${actual}, within ${pct}% of the requested ${expected.aspectRatio} ratio.`
      : `Generated image is ${actual} (ratio ${actualRatio.toFixed(3)}), ${pct}% off the requested ${expected.aspectRatio} (${expectedRatio.toFixed(3)}).`,
    expected: expected.aspectRatio,
    actual: `${actual} (${actualRatio.toFixed(3)})`,
  };
}

/**
 * Calculates the weighted score and overall status from individual check results.
 *
 * - pass earns the category's full weight, fail earns 0.
 * - not_applicable categories are dropped and the remaining weights are normalized to 100.
 * - A failed check whose severity is listed in QA_CRITICAL_SEVERITIES forces "fail".
 * - If any check errored, there is no score and the status is "error" (never a pass),
 *   but individual results, including any critical failures already found, are kept.
 */
export function calculateQAScore(
  checks: Record<QACategory, QACheck>,
): Pick<QAResult, "score" | "status" | "criticalFailures" | "checks"> {
  const results = {} as Record<QACategory, QACheckResult>;
  const criticalFailures: string[] = [];
  let applicableWeight = 0;
  let earnedWeight = 0;
  let hasError = false;

  for (const category of QA_CATEGORIES) {
    const check = checks[category];
    const weight = QA_WEIGHTS[category];
    const critical = check.status === "fail" && QA_CRITICAL_SEVERITIES[category].includes(check.severity);
    let earned: number | null = null;

    if (check.status === "pass" || check.status === "fail") {
      earned = check.status === "pass" ? weight : 0;
      applicableWeight += weight;
      earnedWeight += earned;
    } else if (check.status === "error") {
      hasError = true;
    }
    if (critical) criticalFailures.push(`${QA_CATEGORY_LABELS[category]}: ${check.description}`);
    results[category] = { ...check, weight, earned, critical };
  }

  if (hasError) {
    return { score: null, status: criticalFailures.length ? "fail" : "error", criticalFailures, checks: results };
  }

  // If every category is N/A there is nothing to fail on; treat as a full score.
  const score = applicableWeight === 0 ? 100 : Math.round((earnedWeight / applicableWeight) * 100);
  const status = score >= QA_PASS_THRESHOLD && criticalFailures.length === 0 ? "pass" : "fail";
  return { score, status, criticalFailures, checks: results };
}

/** Normalized weight for one category, i.e. how many of the 100 points it is worth here. */
export function normalizedWeight(checks: Record<QACategory, { status: string }>, category: QACategory) {
  const applicable = QA_CATEGORIES.filter((c) => checks[c].status === "pass" || checks[c].status === "fail");
  const total = applicable.reduce((sum, c) => sum + QA_WEIGHTS[c], 0);
  if (!applicable.includes(category) || total === 0) return null;
  return Math.round((QA_WEIGHTS[category] / total) * 100);
}
