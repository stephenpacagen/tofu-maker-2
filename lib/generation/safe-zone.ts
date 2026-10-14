/**
 * Text safe zone for 9:16 ads, taken from the safe-zone reference.
 * Insets are fractions of the canvas so they scale to any resolution.
 * On a 1080×1920 canvas they are about 190px from the top, 647px up from
 * the bottom (a 33.7% exclusion), and 54px in from each side.
 */
export const TEXT_SAFE_ZONE_9X16 = {
  top: 0.099,
  bottom: 0.337,
  left: 0.05,
  right: 0.05,
} as const;

/** Pixel insets for a canvas of `width` × `height`. Bottom is measured up from the bottom edge. */
export function textSafeZoneInsets(width: number, height: number) {
  return {
    top: height * TEXT_SAFE_ZONE_9X16.top,
    bottom: height * TEXT_SAFE_ZONE_9X16.bottom,
    left: width * TEXT_SAFE_ZONE_9X16.left,
    right: width * TEXT_SAFE_ZONE_9X16.right,
  };
}

/** Tells the model to keep every text box inside the 9:16 safe zone. */
export function textSafeZonePrompt() {
  const { top, bottom, left, right } = TEXT_SAFE_ZONE_9X16;
  const sample = textSafeZoneInsets(1080, 1920);
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return [
    "This is a 9:16 ad. Keep all text inside the text safe zone.",
    `The excluded margins are ${pct(top)} of the canvas height at the top, ${pct(bottom)} of the canvas height at the bottom, and ${pct(left)} of the canvas width on the left and ${pct(right)} on the right.`,
    "Use those percentages of the actual canvas. Do not use a fixed pixel inset.",
    `On a 1080×1920 canvas that is about ${Math.round(sample.top)}px from the top, ${Math.round(sample.bottom)}px up from the bottom, and ${Math.round(sample.left)}px in from each side.`,
    "Headlines, body copy, CTAs, captions, and disclaimers must sit entirely inside the zone.",
    "Judge the whole text box, including font size, line height, wrapping, and any stroke, shadow, or glow that extends past the letters.",
    "No part of that box may enter the excluded margins.",
    "If a line does not fit, make the type smaller, wrap it, or move it until the whole box is inside the zone.",
    "Text printed on the product itself may stay on the product.",
  ].join(" ");
}
