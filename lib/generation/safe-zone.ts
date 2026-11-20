/**
 * Global 9:16 text-safe-zone constraint.
 *
 * Reference canvas is 1080 × 1920. Coordinates scale proportionally to any
 * other 9:16 resolution. Do not apply to 1:1, 4:5, or other aspect ratios.
 */

export const SAFE_ZONE_REFERENCE = { width: 1080, height: 1920 } as const;

/** Outer safe-zone polygon on the reference canvas (clockwise from top-left). */
export const SAFE_ZONE_POLYGON_9X16 = [
  { x: 70, y: 271 },
  { x: 1010, y: 271 },
  { x: 1010, y: 1150 },
  { x: 854, y: 1150 },
  { x: 854, y: 1247 },
  { x: 70, y: 1247 },
] as const;

/** Stricter content-safe areas inside the polygon (padding from the edges). */
export const SAFE_ZONE_CONTENT_9X16 = {
  /** Recommended for headlines and important text. */
  primary: { x: 110, y: 310, width: 860, height: 800 },
  /** For additional text below the primary region. */
  lower: { x: 110, y: 1110, width: 705, height: 95 },
} as const;

export type SafeZonePoint = { x: number; y: number };
export type SafeZoneRect = { x: number; y: number; width: number; height: number };

function scaleX(x: number, width: number) {
  return (x / SAFE_ZONE_REFERENCE.width) * width;
}

function scaleY(y: number, height: number) {
  return (y / SAFE_ZONE_REFERENCE.height) * height;
}

/** Polygon vertices scaled to a canvas of `width` × `height`. */
export function textSafeZonePolygon(width: number, height: number): SafeZonePoint[] {
  return SAFE_ZONE_POLYGON_9X16.map((point) => ({
    x: scaleX(point.x, width),
    y: scaleY(point.y, height),
  }));
}

/** Primary and lower content-safe rectangles scaled to the canvas. */
export function textSafeZoneContentRegions(width: number, height: number): {
  primary: SafeZoneRect;
  lower: SafeZoneRect;
} {
  const scale = (rect: SafeZoneRect): SafeZoneRect => ({
    x: scaleX(rect.x, width),
    y: scaleY(rect.y, height),
    width: scaleX(rect.width, width),
    height: scaleY(rect.height, height),
  });
  return {
    primary: scale(SAFE_ZONE_CONTENT_9X16.primary),
    lower: scale(SAFE_ZONE_CONTENT_9X16.lower),
  };
}

/**
 * Axis-aligned bounds of the outer safe polygon, useful when a caller only
 * needs a simple inset. Bottom is measured up from the bottom edge.
 */
export function textSafeZoneInsets(width: number, height: number) {
  const polygon = textSafeZonePolygon(width, height);
  const left = Math.min(...polygon.map((p) => p.x));
  const right = width - Math.max(...polygon.map((p) => p.x));
  const top = Math.min(...polygon.map((p) => p.y));
  const bottom = height - Math.max(...polygon.map((p) => p.y));
  return { top, bottom, left, right };
}

/** SVG path for the safe-zone polygon on the reference canvas. */
export function textSafeZonePolygonPath(
  points: readonly SafeZonePoint[] = SAFE_ZONE_POLYGON_9X16,
) {
  return points
    .map((point, i) => `${i === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ")
    .concat(" Z");
}

/**
 * Prompt block appended to every 9:16 generation. Place it last so creative
 * instructions cannot override the constraint.
 */
export function textSafeZonePrompt() {
  const { width, height } = SAFE_ZONE_REFERENCE;
  const polygon = SAFE_ZONE_POLYGON_9X16;
  const { primary, lower } = SAFE_ZONE_CONTENT_9X16;
  const pct = (n: number, total: number) => `${((n / total) * 100).toFixed(1)}%`;
  const pointList = polygon
    .map((p) => `(${p.x},${p.y})`)
    .join(", ");

  return [
    "Required — 9:16 text safe zone (do not override): keep every important text element entirely inside the safe-zone polygon below.",
    `Reference canvas: ${width}×${height}. Scale all coordinates proportionally for other 9:16 resolutions.`,
    `Safe-zone polygon vertices: [${pointList}].`,
    `Boundaries: top Y=${polygon[0].y}px (${pct(polygon[0].y, height)}), left X=${polygon[0].x}px (${pct(polygon[0].x, width)}), right X=${polygon[1].x}px (${pct(polygon[1].x, width)}) until Y=${polygon[2].y}px, then right steps in to X=${polygon[3].x}px (${pct(polygon[3].x, width)}) from Y=${polygon[3].y}px downward, bottom Y=${polygon[5].y}px (${pct(polygon[5].y, height)}).`,
    `Primary content-safe region (use for headlines and important text): X ${primary.x}–${primary.x + primary.width}px, Y ${primary.y}–${primary.y + primary.height}px.`,
    `Lower content-safe region (for additional text): X ${lower.x}–${lower.x + lower.width}px, Y ${lower.y}–${lower.y + lower.height}px.`,
    "Place headlines, subheadlines, body copy, promotional offers, logos that contain text, and other essential text entirely inside the safe zone. Prefer the primary region for the main headline.",
    "Keep the outer / red-exclusion areas free of important text. Backgrounds, decorative elements, and nonessential imagery may fill the whole canvas.",
    "Judge the whole text bounding box, including font size, line height, wrapping, outlines, shadows, glows, and decorative typography. No part of that box may cross outside the polygon.",
    "Never resize, crop, or reposition the entire image just to force text into the safe zone. Instead adjust text position, font size, line breaks, and text container width. If text still cannot fit, reduce its size or reflow it while preserving readability.",
    "Apply these rules regardless of visual style, creative concept, or other prompt instructions. Text printed on the product itself may stay on the product.",
  ].join(" ");
}
