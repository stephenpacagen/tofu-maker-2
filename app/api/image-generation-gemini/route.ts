import { describeGeminiError, generateGeminiImage } from "@/lib/gemini/image-generation";
import {
  GEMINI_ASPECT_RATIOS,
  GEMINI_IMAGE_MODELS,
  GEMINI_IMAGE_SIZES,
  GEMINI_REFERENCE_IMAGE_TYPES,
  GEMINI_VARIATION_COUNTS,
  MAX_GEMINI_REFERENCE_IMAGE_BYTES,
  MAX_GEMINI_REFERENCE_IMAGES,
  MAX_GEMINI_TOTAL_IMAGE_BYTES,
  type GeminiImageGenerationRequest,
  type GeminiImageGenerationResponse,
} from "@/lib/gemini/image-generation-types";

export const maxDuration = 300;

const MAX_PROMPT_LENGTH = 30000;
const MAX_MB = MAX_GEMINI_REFERENCE_IMAGE_BYTES / 1024 / 1024;

function oneOf<T extends string | number>(value: FormDataEntryValue | null, allowed: readonly T[]): T | undefined {
  return allowed.find((a) => String(a) === value);
}

function parseRequest(form: FormData): GeminiImageGenerationRequest | string {
  const prompt = String(form.get("prompt") ?? "").trim();
  if (!prompt) return "Prompt is required";
  if (prompt.length > MAX_PROMPT_LENGTH) return `Prompt must be at most ${MAX_PROMPT_LENGTH} characters`;

  const model = oneOf(form.get("model"), GEMINI_IMAGE_MODELS);
  if (!model) return "Invalid model";
  const aspectRatio = oneOf(form.get("aspectRatio"), GEMINI_ASPECT_RATIOS);
  if (!aspectRatio) return "Invalid aspect ratio";
  const imageSize = oneOf(form.get("imageSize"), GEMINI_IMAGE_SIZES.map((s) => s.value));
  if (!imageSize) return "Invalid image size";
  const n = oneOf(form.get("n"), GEMINI_VARIATION_COUNTS);
  if (!n) return `Number of variations must be ${GEMINI_VARIATION_COUNTS[0]}-${GEMINI_VARIATION_COUNTS.at(-1)}`;

  const entries = form.getAll("referenceImages");
  if (entries.length > MAX_GEMINI_REFERENCE_IMAGES) return `Use at most ${MAX_GEMINI_REFERENCE_IMAGES} reference images`;
  const referenceImages: File[] = [];
  for (const [i, entry] of entries.entries()) {
    const file = checkImage(entry, `Reference image ${i + 1}`);
    if (typeof file === "string") return file;
    referenceImages.push(file);
  }

  const productEntry = form.get("productImage");
  const productImage = productEntry === null ? undefined : checkImage(productEntry, "Product image");
  if (typeof productImage === "string") return productImage;

  const totalBytes = [...referenceImages, productImage].reduce((sum, f) => sum + (f?.size ?? 0), 0);
  if (totalBytes > MAX_GEMINI_TOTAL_IMAGE_BYTES)
    return `All images together must be under ${MAX_GEMINI_TOTAL_IMAGE_BYTES / 1024 / 1024}MB for Gemini`;

  return { prompt, model, aspectRatio, imageSize, n, referenceImages, productImage };
}

/** Returns the File, or an error message if it can't be sent to Gemini. */
function checkImage(entry: FormDataEntryValue, label: string): File | string {
  if (!(entry instanceof File)) return `${label} is not a valid file`;
  if (entry.size === 0) return `${label} (${entry.name}) is empty`;
  if (!GEMINI_REFERENCE_IMAGE_TYPES.includes(entry.type))
    return `${label} (${entry.name}) has unsupported type "${entry.type || "unknown"}". Use PNG, JPEG, or WebP.`;
  if (entry.size > MAX_GEMINI_REFERENCE_IMAGE_BYTES) return `${label} (${entry.name}) is larger than ${MAX_MB}MB`;
  return entry;
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data" } satisfies GeminiImageGenerationResponse, {
      status: 400,
    });
  }

  const parsed = parseRequest(form);
  if (typeof parsed === "string") {
    return Response.json({ error: parsed } satisfies GeminiImageGenerationResponse, { status: 400 });
  }

  try {
    // The generated image is returned inside the JSON body as a data: URL; see generateGeminiImage().
    const result = await generateGeminiImage(parsed);
    return Response.json(result satisfies GeminiImageGenerationResponse);
  } catch (err) {
    console.error("[image-generation-gemini]", err);
    const { message, status } = describeGeminiError(err);
    return Response.json({ error: message } satisfies GeminiImageGenerationResponse, { status });
  }
}
