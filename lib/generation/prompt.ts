import { summarizeLandingPage } from "@/lib/breakdown";
import { BRANDS } from "@/lib/brands";
import type { AdBrief, BriefReference, Dimension } from "@/lib/types";

export type PromptInputs = {
  format: BriefReference | null;
  style: BriefReference | null;
  productPhotoCount: number;
};

const STYLE_GUIDE =
  "palette, lighting, texture, mood, and if it is animated or cartoony, its art style";
const LAYOUT_GUIDE = "framing, composition, and element placement";

/** Keep the brand name off the image unless the brief asks for it. Product packaging stays as photographed. */
function brandMarkLines(brand: string) {
  const word = `"${brand}"`;
  return {
    early: `Do not add a ${brand} logo, wordmark, or the word ${word} anywhere in the image, including by copying either from a reference image. Branding already printed on the product photograph stays as photographed. Add the logo or the word only when the requested copy or a note below explicitly asks for it.`,
    required: `Required: do not place a ${brand} logo or the word ${word} in the image unless the requested copy, a note above, or further instructions explicitly ask for it. Branding already printed on the product photograph stays as photographed.`,
  };
}

/** One uploaded image is filling both roles, so it is attached only once. */
export function referenceCoversBoth(inputs: Pick<PromptInputs, "format" | "style">) {
  return !!inputs.format && !!inputs.style && inputs.format.id === inputs.style.id;
}

/** How many reference images are actually attached, matching `imageGuide`. */
function attachedReferenceCount(inputs: Pick<PromptInputs, "format" | "style">) {
  if (referenceCoversBoth(inputs)) return 1;
  return (inputs.format ? 1 : 0) + (inputs.style ? 1 : 0);
}

/** Describes the attached images in the same order as `orderedImages`. */
function imageGuide({ format, style, productPhotoCount }: PromptInputs) {
  const lines: string[] = [];
  let n = 1;
  if (referenceCoversBoth({ format, style })) {
    lines.push(
      `Image ${n++} is both the STYLE and the LAYOUT reference. For style, match its ${STYLE_GUIDE}. For layout, follow its ${LAYOUT_GUIDE}.`,
    );
  } else if (format && style) {
    lines.push(
      `Image ${n++} is the FORMAT reference and the main view of this ad. Compositionally, the result must look like this picture: the same ${LAYOUT_GUIDE}. Do not copy its art style or aesthetics.`,
    );
    lines.push(
      `Image ${n++} is the STYLE reference. The art style and aesthetics of the finished ad must be derived from this image: its ${STYLE_GUIDE}. Restyle the format view so it is visibly rendered like this picture. Do not copy its composition or what the picture is a view of.`,
    );
    const directed = Boolean(format.prompt.trim() || style.prompt.trim());
    lines.push(
      directed
        ? "Keep that split unless a layout or style note below explicitly asks for something else."
        : "This is required. The finished ad must not keep the format image's rendering, colors, or drawing style. Take the view and composition from the format image, then apply a clear visual translation into the style reference's art style and aesthetics. If the style reference is illustrated, painted, or cartoony, the ad must be too. If it is photographic, the ad must share its lighting, color, and texture.",
    );
  } else {
    if (format) {
      lines.push(
        `Image ${n++} is the LAYOUT reference: follow its ${LAYOUT_GUIDE}. Do not copy its palette, lighting, typography, mood, or art style.`,
      );
    }
    if (style) {
      lines.push(
        `Image ${n++} is the STYLE reference: match its ${STYLE_GUIDE}. Do not copy its layout or element placement.`,
      );
    }
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

  const groupId = inputs.format?.groupId ?? inputs.style?.groupId;
  const group = groupId ? brief.referenceGroups.find((g) => g.id === groupId) : undefined;
  const description = group?.description?.trim();
  const keywords = group?.keywords?.length ? group.keywords : brief.keywords;
  if (description) lines.push(`Description: ${description}`);
  else if (keywords.length > 0) lines.push(`Description: ${keywords.join("; ")}.`);

  const landingPages = (brief.landingPages ?? [])
    .map(summarizeLandingPage)
    .filter((page) => page.title || page.summary || page.key_points.length > 0);
  if (landingPages.length > 0) {
    lines.push(
      "This ad sends people to the landing page below. That page is what the ad is about. The copy should make sense with it and feel relatable: the same promise, the same problem, and the same way of talking about it.",
    );
    for (const page of landingPages) {
      const parts = [`Landing page: ${page.title || page.url}`];
      if (page.summary) parts.push(`Summary: ${page.summary}`);
      if (page.key_points.length > 0) parts.push(`Key points: ${page.key_points.join(" | ")}`);
      lines.push(parts.join("\n"));
    }
  }

  const fonts = BRANDS.find((brand) => brand.name === brief.brand)?.fonts;
  if (fonts) {
    lines.push(
      `Set titles and headlines in ${fonts.title}. Set body text, regular text, and every other line of type in ${fonts.text}. Use these typefaces instead of the fonts in the reference images.`,
    );
  }

  if (brief.copyMode === "separate") {
    lines.push(
      landingPages.length > 0
        ? "Do not render any text in the image; copy will be added separately. Make the image's idea something that copy about this landing page can sit on."
        : "Do not render any text in the image; copy will be added separately.",
    );
  } else if (brief.copy.trim()) {
    lines.push(`Render this copy exactly, spelled correctly: "${brief.copy.trim()}".`);
  } else if (landingPages.length > 0) {
    lines.push(
      "Write short on-image copy from the landing page summary and key points, so it reads as a natural lead-in to that page.",
    );
  }

  lines.push("Do not include any other company's logos or trademarks.");
  const brandMark = brandMarkLines(brief.brand);
  lines.push(brandMark.early);

  if (referenceCoversBoth(inputs)) {
    const notes = inputs.format?.prompt.trim();
    if (notes) lines.push(`Reference notes: ${notes}`);
  } else {
    if (inputs.format?.prompt.trim()) lines.push(`Layout notes: ${inputs.format.prompt.trim()}`);
    if (inputs.style?.prompt.trim()) lines.push(`Style notes: ${inputs.style.prompt.trim()}`);
  }

  if (
    inputs.format &&
    inputs.style &&
    !referenceCoversBoth(inputs) &&
    !inputs.format.prompt.trim() &&
    !inputs.style.prompt.trim()
  ) {
    lines.push(
      "Required: derive the art style and aesthetics from the style reference. The ad must look styled like that image, while staying compositionally the format reference.",
    );
  }

  lines.push(brandMark.required);

  return lines.join("\n");
}

/** Revises one generated ad, keeping the original brief and attaching the current image. */
export function buildRegeneratePrompt(
  brief: AdBrief,
  inputs: PromptInputs,
  instruction: string,
  dimension: Dimension,
  extraImageCount: number,
) {
  const base = buildPrompt(brief, inputs, dimension);
  let n = attachedReferenceCount(inputs) + inputs.productPhotoCount + 1;
  const lines = [
    base,
    `Image ${n} is the current ad. Revise this image using the instructions below.`,
  ];
  n += 1;
  if (extraImageCount === 1) lines.push(`Image ${n} is an additional reference for this revision.`);
  else if (extraImageCount > 1) lines.push(`Images ${n}-${n + extraImageCount - 1} are additional references for this revision.`);
  lines.push(`Further instructions: ${instruction.trim()}`);
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
