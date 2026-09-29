import { describeOpenAIError, generateImages } from "@/lib/openai/image-generation";
import {
  IMAGE_COUNTS,
  IMAGE_MODELS,
  IMAGE_OUTPUT_FORMATS,
  IMAGE_QUALITIES,
  IMAGE_SIZES,
  MAX_REFERENCE_IMAGE_BYTES,
  REFERENCE_IMAGE_TYPES,
  type ImageGenerationRequest,
  type ImageGenerationResponse,
} from "@/lib/openai/image-generation-types";

export const maxDuration = 300;

const MAX_PROMPT_LENGTH = 32000;

function oneOf<T extends string | number>(value: FormDataEntryValue | null, allowed: readonly T[]): T | undefined {
  const match = allowed.find((a) => String(a) === value);
  return match;
}

function parseRequest(form: FormData): ImageGenerationRequest | string {
  const prompt = String(form.get("prompt") ?? "").trim();
  if (!prompt) return "Prompt is required";
  if (prompt.length > MAX_PROMPT_LENGTH) return `Prompt must be at most ${MAX_PROMPT_LENGTH} characters`;

  const model = oneOf(form.get("model"), IMAGE_MODELS);
  if (!model) return "Invalid model";
  const quality = oneOf(form.get("quality"), IMAGE_QUALITIES);
  if (!quality) return "Invalid quality";
  const size = oneOf(form.get("size"), IMAGE_SIZES.map((s) => s.value));
  if (!size) return "Invalid size";
  const outputFormat = oneOf(form.get("outputFormat"), IMAGE_OUTPUT_FORMATS.map((f) => f.value));
  if (!outputFormat) return "Invalid output format";
  const n = oneOf(form.get("n"), IMAGE_COUNTS);
  if (!n) return "Number of images must be 1-4";

  const referenceImage = parseImage(form.get("referenceImage"), "Reference image");
  if (typeof referenceImage === "string") return referenceImage;
  const productImage = parseImage(form.get("productImage"), "Product image");
  if (typeof productImage === "string") return productImage;

  return { prompt, model, quality, size, outputFormat, n, referenceImage, productImage };
}

/** Returns the File, undefined if none was uploaded, or an error message. */
function parseImage(value: FormDataEntryValue | null, label: string): File | undefined | string {
  if (!(value instanceof File) || value.size === 0) return undefined;
  if (!REFERENCE_IMAGE_TYPES.includes(value.type)) return `${label} must be PNG, JPEG, or WebP`;
  if (value.size > MAX_REFERENCE_IMAGE_BYTES) return `${label} must be smaller than 20MB`;
  return value;
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data" } satisfies ImageGenerationResponse, { status: 400 });
  }

  const parsed = parseRequest(form);
  if (typeof parsed === "string") {
    return Response.json({ error: parsed } satisfies ImageGenerationResponse, { status: 400 });
  }

  try {
    // Base64 images come back inside the JSON body; see generateImages().
    const result = await generateImages(parsed);
    return Response.json(result satisfies ImageGenerationResponse);
  } catch (err) {
    console.error("[image-generation]", err);
    const { message, status } = describeOpenAIError(err);
    return Response.json({ error: message } satisfies ImageGenerationResponse, { status });
  }
}
