import type { Dimension } from "@/lib/types";
import type { AdGenerator } from "./types";

const SIZES: Record<Dimension, [number, number]> = {
  "9x16": [540, 960],
  "4x5": [768, 960],
  "1x1": [960, 960],
};

const HUES = [210, 330, 30, 150, 270, 0];

const escapeXml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/**
 * Placeholder provider: crops the style reference (or format reference) to the
 * target aspect ratio and overlays the brief, so the full workflow runs
 * without an image model.
 */
export const mockGenerator: AdGenerator = {
  name: "mock",
  async generate({ brief, styleImage, formatImage, dimension, count }) {
    const [w, h] = SIZES[dimension];
    const base = (styleImage ?? formatImage)!;
    const refHref = `data:${base.type};base64,${Buffer.from(base.bytes).toString("base64")}`;
    const caption = escapeXml(`${brief.brand} · ${brief.products.map((p) => p.sku).join(" + ")}`);
    const refsLine = escapeXml(
      [formatImage && `F: ${formatImage.name}`, styleImage && `S: ${styleImage.name}`].filter(Boolean).join(" · "),
    );

    return Array.from({ length: count }, (_, i) => {
      const hue = HUES[i % HUES.length];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image href="${refHref}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="${w}" height="${h}" fill="hsl(${hue} 80% 50%)" fill-opacity="0.18"/>
  <rect y="${h - 150}" width="${w}" height="150" fill="black" fill-opacity="0.6"/>
  <text x="32" y="${h - 96}" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="white">${caption}</text>
  <text x="32" y="${h - 52}" font-family="Arial, sans-serif" font-size="22" fill="white" fill-opacity="0.85">${refsLine}</text>
  <text x="${w - 32}" y="52" text-anchor="end" font-family="monospace" font-size="22" fill="white">MOCK ${dimension} #${i + 1}</text>
</svg>`;
      return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    });
  },
};
