import { buildResizePrompt, getGenerator, type ImageInput } from "@/lib/generation";
import {
  GEMINI_IMAGE_SIZES,
  IMAGE_QUALITIES,
  isGenerationModel,
  type GenerationOptions,
} from "@/lib/generation/models";
import { DIMENSIONS, type AdBrief, type Dimension } from "@/lib/types";

export const maxDuration = 300;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type ResizeResponse = { imageUrl: string; prompt: string; failures: string[] } | { error: string };

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
 * Reframes one already-generated ad into another dimension. The model receives that
 * image and a prompt that tells it to keep every element and resize to the new shape.
 */
export async function POST(request: Request) {
  let dimension: Dimension;
  let options: GenerationOptions;
  let brief: AdBrief;
  let form: FormData;
  try {
    form = await request.formData();
    dimension = String(form.get("dimension")) as Dimension;
    options = JSON.parse(String(form.get("options")));
    brief = JSON.parse(String(form.get("brief")));
  } catch {
    return Response.json({ error: "Invalid request body" } satisfies ResizeResponse, { status: 400 });
  }

  if (!DIMENSIONS.includes(dimension)) {
    return Response.json({ error: "Pick a valid dimension" } satisfies ResizeResponse, { status: 400 });
  }
  const invalid = validateOptions(options);
  if (invalid) return Response.json({ error: invalid } satisfies ResizeResponse, { status: 400 });
  if (!brief?.brand || !Array.isArray(brief.products)) {
    return Response.json({ error: "Missing brief" } satisfies ResizeResponse, { status: 400 });
  }

  try {
    const image = await toImageInput(form.get("image"));
    if (!image) throw new Error("Missing image to resize");

    const prompt = buildResizePrompt(dimension);
    const generator = getGenerator(options.model);
    const { urls, failures } = await generator.generate({
      brief,
      styleImage: image,
      productImages: [],
      dimension,
      count: 1,
      prompt,
      options,
    });
    const imageUrl = urls[0];
    if (!imageUrl) throw new Error(failures[0] ?? "Resize returned no image");

    return Response.json({ imageUrl, prompt, failures } satisfies ResizeResponse);
  } catch (error) {
    console.error("[resize-ad]", error);
    const message = error instanceof Error ? error.message : "Resize failed";
    return Response.json({ error: message } satisfies ResizeResponse, { status: 502 });
  }
}
