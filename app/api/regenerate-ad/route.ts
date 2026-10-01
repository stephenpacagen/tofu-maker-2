import { buildRegeneratePrompt, getGenerator, referenceCoversBoth, type ImageInput } from "@/lib/generation";
import {
  GEMINI_IMAGE_SIZES,
  IMAGE_QUALITIES,
  isGenerationModel,
  type GenerationOptions,
} from "@/lib/generation/models";
import { DIMENSIONS, type AdBrief, type Dimension } from "@/lib/types";

export const maxDuration = 300;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_INSTRUCTION_CHARS = 2000;

type RegenerateResponse = { imageUrl: string; prompt: string; failures: string[] } | { error: string };

async function toImageInput(value: FormDataEntryValue | null): Promise<ImageInput | undefined> {
  if (!(value instanceof File)) return undefined;
  if (!value.type.startsWith("image/")) throw new Error(`${value.name} is not an image`);
  if (value.size > MAX_IMAGE_BYTES) throw new Error(`${value.name} is larger than 10MB`);
  return { name: value.name, type: value.type, bytes: await value.arrayBuffer() };
}

function validateOptions(options: GenerationOptions): string | null {
  if (!isGenerationModel(options?.model)) return "Unknown image model";
  if (!IMAGE_QUALITIES.includes(options.openaiQuality)) return "Invalid OpenAI quality";
  if (!GEMINI_IMAGE_SIZES.some((s) => s.value === options.geminiImageSize)) return "Invalid Gemini image size";
  return null;
}

/**
 * Regenerates one ad. The model receives the original style, format, and product
 * images, the current ad, an optional extra image, and the same brief context.
 */
export async function POST(request: Request) {
  let dimension: Dimension;
  let options: GenerationOptions;
  let brief: AdBrief;
  let instruction: string;
  let styleRefId: string | null;
  let formatRefId: string | null;
  let form: FormData;
  try {
    form = await request.formData();
    dimension = String(form.get("dimension")) as Dimension;
    options = JSON.parse(String(form.get("options")));
    brief = JSON.parse(String(form.get("brief")));
    instruction = String(form.get("instruction") ?? "").trim();
    styleRefId = String(form.get("styleRefId") ?? "") || null;
    formatRefId = String(form.get("formatRefId") ?? "") || null;
  } catch {
    return Response.json({ error: "Invalid request body" } satisfies RegenerateResponse, { status: 400 });
  }

  if (!DIMENSIONS.includes(dimension)) {
    return Response.json({ error: "Pick a valid dimension" } satisfies RegenerateResponse, { status: 400 });
  }
  if (!instruction) {
    return Response.json({ error: "Add instructions for the regeneration" } satisfies RegenerateResponse, { status: 400 });
  }
  if (instruction.length > MAX_INSTRUCTION_CHARS) {
    return Response.json(
      { error: `Instructions must be ${MAX_INSTRUCTION_CHARS} characters or fewer` } satisfies RegenerateResponse,
      { status: 400 },
    );
  }
  const invalid = validateOptions(options);
  if (invalid) return Response.json({ error: invalid } satisfies RegenerateResponse, { status: 400 });
  if (!brief?.brand || !Array.isArray(brief.products)) {
    return Response.json({ error: "Missing brief" } satisfies RegenerateResponse, { status: 400 });
  }

  try {
    const style = styleRefId ? brief.references.find((r) => r.id === styleRefId) : undefined;
    const format = formatRefId ? brief.references.find((r) => r.id === formatRefId) : undefined;
    if (styleRefId && !style) throw new Error("Unknown style reference");
    if (formatRefId && !format) throw new Error("Unknown format reference");

    const coversBoth = referenceCoversBoth({ format: format ?? null, style: style ?? null });
    const styleImage =
      style && !coversBoth ? await toImageInput(form.get(`reference:${style.id}`)) : undefined;
    const formatImage = format ? await toImageInput(form.get(`reference:${format.id}`)) : undefined;
    if (style && !coversBoth && !styleImage) throw new Error(`Missing image for style reference ${style.fileName}`);
    if (format && !formatImage) throw new Error(`Missing image for format reference ${format.fileName}`);

    const productImages: ImageInput[] = [];
    if (brief.productVisibility === "secondary") {
      for (const p of brief.products) {
        const image = await toImageInput(form.get(`product:${p.id}`));
        if (image) productImages.push(image);
      }
    }

    const revisionImage = await toImageInput(form.get("image"));
    if (!revisionImage) throw new Error("Missing image to regenerate");
    const extraImages: ImageInput[] = [];
    for (const value of form.getAll("extra")) {
      const image = await toImageInput(value);
      if (image) extraImages.push(image);
    }

    const prompt = buildRegeneratePrompt(
      brief,
      { format: format ?? null, style: style ?? null, productPhotoCount: productImages.length },
      instruction,
      dimension,
      extraImages.length,
    );
    const generator = getGenerator(options.model);
    const { urls, failures } = await generator.generate({
      brief,
      formatImage,
      styleImage,
      productImages,
      revisionImage,
      extraImages,
      dimension,
      count: 1,
      prompt,
      options,
    });
    const imageUrl = urls[0];
    if (!imageUrl) throw new Error(failures[0] ?? "Regeneration returned no image");

    return Response.json({ imageUrl, prompt, failures } satisfies RegenerateResponse);
  } catch (error) {
    console.error("[regenerate-ad]", error);
    const message = error instanceof Error ? error.message : "Regeneration failed";
    return Response.json({ error: message } satisfies RegenerateResponse, { status: 502 });
  }
}
