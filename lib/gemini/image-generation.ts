import { GoogleGenAI } from "@google/genai";
import type {
  GeminiImageGenerationRequest,
  GeminiImageGenerationSuccess,
  GeminiUsage,
  GeminiVariation,
} from "./image-generation-types";

// Gemini-specific request shapes for the Interactions API (ai.interactions.create).
type GeminiTextBlock = { type: "text"; text: string };
type GeminiImageBlock = { type: "image"; mime_type: string; data: string };
type GeminiInputBlock = GeminiTextBlock | GeminiImageBlock;

type GeminiContentBlock = { type: string; text?: string; data?: string; mime_type?: string };

/** Error with an HTTP status we can pass back to the browser. */
export class GeminiImageError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

let client: GoogleGenAI | undefined;

function getClient() {
  // The API key is read here, on the server only, from process.env.GEMINI_API_KEY
  // (loaded by Next.js from .env.local). It has no NEXT_PUBLIC_ prefix, so it is never
  // inlined into client bundles, and this module is only imported by the API route.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiImageError("GEMINI_API_KEY is not set. Add it to .env.local and restart the dev server.", 500);
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/**
 * Converts an uploaded File into an inline Gemini image block. The actual image bytes
 * are sent (base64-encoded in `data`), not a text description of the image.
 */
async function toImageBlock(file: File): Promise<GeminiImageBlock> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return { type: "image", mime_type: file.type, data: bytes.toString("base64") };
}

/** Tells Gemini which input image is the product, since it only sees images by position. */
function describeProduct(referenceCount: number) {
  const position = referenceCount + 1;
  const which = referenceCount > 0 ? `Image ${position} (the last image)` : "Image 1";
  return `${which} is the product image. Feature this exact product in the ad, keeping its shape, colors, packaging, and labels accurate.\n\n`;
}

type SingleVariationRequest = Pick<GeminiImageGenerationRequest, "model" | "aspectRatio" | "imageSize"> & {
  input: GeminiInputBlock[];
};

/** Runs one interaction and extracts its image. Gemini returns one image per interaction. */
async function generateOne(
  ai: GoogleGenAI,
  req: SingleVariationRequest,
): Promise<{ variation: GeminiVariation; model?: string }> {
  const started = Date.now();
  const interaction = await ai.interactions.create({
    model: req.model,
    input: req.input,
    response_format: {
      type: "image",
      aspect_ratio: req.aspectRatio,
      image_size: req.imageSize,
    },
  });

  if (interaction.status && interaction.status !== "completed") {
    const reason = interaction.errors?.map((e) => JSON.stringify(e)).join("; ");
    throw new GeminiImageError(`Gemini interaction ended with status "${interaction.status}"${reason ? `: ${reason}` : ""}`);
  }

  // Collect every block the model produced. output_image/output_text are SDK convenience
  // fields for the last image/text; walking the steps catches anything they miss.
  const outputBlocks: GeminiContentBlock[] = [];
  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    if (step.error) throw new GeminiImageError(`Gemini returned an error: ${step.error.message ?? JSON.stringify(step.error)}`);
    outputBlocks.push(...((step.content ?? []) as GeminiContentBlock[]));
  }

  const image = interaction.output_image?.data
    ? interaction.output_image
    : outputBlocks.filter((b) => b.type === "image" && b.data).at(-1);
  const text =
    interaction.output_text?.trim() ||
    outputBlocks
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n")
      .trim() ||
    undefined;

  if (!interaction.steps?.length && !image && !text) {
    throw new GeminiImageError("Gemini returned an empty response.");
  }
  if (!image?.data) {
    // Usually a safety block or the model answering in text instead of drawing.
    throw new GeminiImageError(
      text ? `Gemini did not return an image. It said: ${text}` : "Gemini responded but did not include a generated image.",
    );
  }

  // The generated image comes back base64-encoded; we wrap it in a data: URL so the
  // browser can render and download it without another request.
  const mimeType = image.mime_type ?? "image/png";
  return {
    model: interaction.model,
    variation: {
      dataUrl: `data:${mimeType};base64,${image.data}`,
      mimeType,
      text,
      interactionId: interaction.id,
      status: interaction.status,
      created: interaction.created,
      durationMs: Date.now() - started,
      usage: interaction.usage && {
        inputTokens: interaction.usage.total_input_tokens,
        outputTokens: interaction.usage.total_output_tokens,
        thoughtTokens: interaction.usage.total_thought_tokens,
        totalTokens: interaction.usage.total_tokens,
      },
    },
  };
}

function sumUsage(variations: GeminiVariation[]): GeminiUsage | undefined {
  const withUsage = variations.filter((v) => v.usage);
  if (withUsage.length === 0) return undefined;
  const total = (key: keyof GeminiUsage) => withUsage.reduce((sum, v) => sum + (v.usage?.[key] ?? 0), 0);
  return {
    inputTokens: total("inputTokens"),
    outputTokens: total("outputTokens"),
    thoughtTokens: total("thoughtTokens"),
    totalTokens: total("totalTokens"),
  };
}

export async function generateGeminiImage(req: GeminiImageGenerationRequest): Promise<GeminiImageGenerationSuccess> {
  const ai = getClient();
  const started = Date.now();
  const { prompt, referenceImages, productImage, n, ...settings } = req;

  // Input order: reference image 1, 2, 3, then the product image, then the text prompt.
  // The prompt can refer to "the first image", "the second image", etc. and Gemini will
  // see them in that order.
  const inputFiles = productImage ? [...referenceImages, productImage] : referenceImages;
  const promptSent = productImage ? describeProduct(referenceImages.length) + prompt : prompt;
  const input: GeminiInputBlock[] = [
    ...(await Promise.all(inputFiles.map(toImageBlock))),
    { type: "text", text: promptSent },
  ];

  // The Interactions API has no image-count parameter, so each variation is its own
  // interaction. They run in parallel; the same input blocks are reused for each.
  const outcomes = await Promise.allSettled(Array.from({ length: n }, () => generateOne(ai, { ...settings, input })));
  const succeeded = outcomes.flatMap((o) => (o.status === "fulfilled" ? [o.value] : []));
  const images = succeeded.map((s) => s.variation);
  const failed = outcomes.flatMap((o) => (o.status === "rejected" ? [o.reason as unknown] : []));

  // If every variation failed, surface the first error with its real status (e.g. 429).
  if (succeeded.length === 0) throw failed[0];

  return {
    prompt,
    promptSent,
    settings: { ...settings, n },
    referenceImageNames: referenceImages.map((f) => f.name),
    productImageName: productImage?.name,
    images,
    failures: failed.map((err) => describeGeminiError(err).message),
    durationMs: Date.now() - started,
    debug: {
      modelVersion: succeeded[0].model,
      requested: n,
      succeeded: images.length,
      usage: sumUsage(images),
    },
  };
}

/** Turns SDK/network errors into a message and status worth showing on the test page. */
export function describeGeminiError(err: unknown): { message: string; status: number } {
  if (err instanceof GeminiImageError) return { message: err.message, status: err.status };

  // The Interactions client throws APIError subclasses (not exported), so read the status directly.
  const status =
    err && typeof err === "object" && "status" in err && typeof err.status === "number" ? err.status : undefined;
  const detail = err instanceof Error ? err.message : String(err);

  if (status === 429) {
    return {
      message: `Gemini rate limit or quota exceeded (429). Wait a bit and try again, or check your quota/billing in Google AI Studio. Details: ${detail}`,
      status: 429,
    };
  }
  if (status === 401 || status === 403) {
    return { message: `Gemini rejected the API key or permissions (${status}): ${detail}`, status };
  }
  if (status) return { message: `Gemini API error (${status}): ${detail}`, status: status >= 500 ? 502 : status };
  return { message: `Could not reach Gemini: ${detail}`, status: 502 };
}
