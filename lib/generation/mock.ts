import type { Dimension } from "@/lib/types";
import type { AdGenerator } from "./types";

const SIZES: Record<Dimension, [number, number]> = {
  "9x16": [540, 960],
  "4x5": [768, 960],
  "1x1": [960, 960],
};

const HUES = [210, 330, 30, 150, 270, 0];

/**
 * Placeholder provider: crops the style reference (or format reference) to the
 * target aspect ratio, so the full workflow runs without an image model.
 */
export const mockGenerator: AdGenerator = {
  name: "mock",
  async generate({ styleImage, formatImage, dimension, count }) {
    const [w, h] = SIZES[dimension];
    const base = (styleImage ?? formatImage)!;
    const refHref = `data:${base.type};base64,${Buffer.from(base.bytes).toString("base64")}`;

    const urls = Array.from({ length: count }, (_, i) => {
      const hue = HUES[i % HUES.length];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image href="${refHref}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="${w}" height="${h}" fill="hsl(${hue} 80% 50%)" fill-opacity="0.18"/>
</svg>`;
      return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    });
    return { urls, failures: [] };
  },
};
