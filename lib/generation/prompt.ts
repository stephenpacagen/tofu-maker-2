import type { AdBrief, BriefReference, Dimension } from "@/lib/types";

export type PromptInputs = {
  format: BriefReference | null;
  style: BriefReference | null;
  productPhotoCount: number;
};

/** Describes the attached images in the same order as `orderedImages`. */
function imageGuide({ format, style, productPhotoCount }: PromptInputs) {
  const lines: string[] = [];
  let n = 1;
  if (format) {
    lines.push(
      `Image ${n++} is the FORMAT reference: reproduce its layout, composition, and element placement, but not its colors or visual style.`,
    );
  }
  if (style) {
    lines.push(
      `Image ${n++} is the STYLE reference: match its visual style, color palette, lighting, texture, and typography feel, but not its layout.`,
    );
  }
  if (productPhotoCount > 0) {
    const range = productPhotoCount === 1 ? `Image ${n}` : `Images ${n}-${n + productPhotoCount - 1}`;
    lines.push(`${range} show the real product; reproduce it exactly as photographed.`);
  }
  if (!style) lines.push("Invent a fresh visual style that fits the brand.");
  if (!format) lines.push("Invent a fresh layout and composition.");
  return lines;
}

export function buildPrompt(brief: AdBrief, inputs: PromptInputs, dimension: Dimension) {
  const productNames = brief.products.map((p) => `"${p.name}"`).join(" and ");
  const lines = [
    `Create a scroll-stopping, top-of-funnel static social ad for the brand "${brief.brand}", promoting ${productNames}.`,
    `Aspect ratio: ${dimension.replace("x", ":")}.`,
    ...imageGuide(inputs),
  ];

  if (brief.productVisibility === "secondary") {
    lines.push(
      "The product appears in the scene but is not the main focus; the attention-grabbing concept comes first.",
    );
  } else {
    lines.push("Do not show the product itself; lead with an attention-grabbing concept tied to the brand.");
  }

  if (brief.keywords.length > 0) lines.push(`Themes and keywords: ${brief.keywords.join(", ")}.`);

  for (const lp of brief.landingPages ?? []) {
    const messaging = [lp.title, lp.description, ...lp.headings.slice(0, 4)].filter(Boolean).join(" | ");
    lines.push(`Align with the messaging of the landing page this ad drives to: ${messaging.slice(0, 500)}`);
  }

  if (brief.copyMode === "separate") {
    lines.push("Do not render any text in the image; copy will be added separately.");
  } else if (brief.copy.trim()) {
    lines.push(`Render this copy exactly, spelled correctly: "${brief.copy.trim()}".`);
  }

  lines.push("Do not include any other company's logos or trademarks.");

  if (inputs.format?.prompt.trim()) lines.push(`Format notes: ${inputs.format.prompt.trim()}`);
  if (inputs.style?.prompt.trim()) lines.push(`Style notes: ${inputs.style.prompt.trim()}`);

  return lines.join("\n");
}

/** Asks the model to reframe an already-generated ad into another size. */
export function buildResizePrompt(dimension: Dimension) {
  const ratio = dimension.replace("x", ":");
  return [
    `Keep all the elements of this image, just resize it to ${dimension} (${ratio}).`,
    "The image itself must become that shape and fill the frame.",
    "Do not add padding, borders, letterboxing, or a blurred background.",
    "Do not add, remove, or rearrange elements, and do not change the copy, colors, or subjects.",
  ].join(" ");
}
