import OpenAI, { toFile } from "openai";
import type { GeneratedImage, ImageGenerationRequest, ImageGenerationSuccess } from "./image-generation-types";

let client: OpenAI | undefined;

function getClient() {
  // The API key is read here, on the server only, from process.env.OPENAI_API_KEY
  // (loaded by Next.js from .env.local). It has no NEXT_PUBLIC_ prefix, so Next.js
  // never inlines it into client bundles, and this module is only imported by the
  // API route.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server.");
  client ??= new OpenAI({ apiKey });
  return client;
}

const MIME_TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

type InputImage = { file: File; role: string };

/** Describes each attached image by position so the model knows which is which. */
function describeImages(images: InputImage[]) {
  if (images.length === 0) return "";
  const lines = images.map((img, i) => `Image ${i + 1}: ${img.role}`);
  return `Input images:\n${lines.join("\n")}\n\n`;
}

const toUpload = async (file: File) =>
  toFile(Buffer.from(await file.arrayBuffer()), file.name, { type: file.type });

export async function generateImages(req: ImageGenerationRequest): Promise<ImageGenerationSuccess> {
  const openai = getClient();
  const started = Date.now();
  const { prompt, referenceImage, productImage, ...settings } = req;

  const inputImages: InputImage[] = [];
  if (referenceImage) {
    inputImages.push({
      file: referenceImage,
      role: "reference ad. Follow its layout, composition, and visual style.",
    });
  }
  if (productImage) {
    inputImages.push({
      file: productImage,
      role: "product. Feature this exact product in the ad, keeping its shape, colors, packaging, and labels accurate.",
    });
  }
  const promptSent = describeImages(inputImages) + prompt;

  const params = {
    model: settings.model,
    prompt: promptSent,
    quality: settings.quality,
    size: settings.size,
    output_format: settings.outputFormat,
    n: settings.n,
  };

  // With a reference and/or product image we call the Images edit endpoint
  // (POST /v1/images/edits). Each File is converted with the SDK's toFile() helper
  // and the SDK sends them as the multipart `image[]` array alongside the prompt,
  // in the order described at the top of promptSent. With no images, we call the
  // generate endpoint for pure text-to-image.
  const response =
    inputImages.length > 0
      ? await openai.images.edit({
          ...params,
          image: await Promise.all(inputImages.map((img) => toUpload(img.file))),
        })
      : await openai.images.generate(params);

  // GPT image models always return base64 (b64_json) rather than URLs. We wrap each
  // one in a data: URL so the browser can render and download it without another request.
  const mimeType = MIME_TYPES[settings.outputFormat];
  const images: GeneratedImage[] = (response.data ?? [])
    .filter((d): d is typeof d & { b64_json: string } => !!d.b64_json)
    .map((d) => ({ dataUrl: `data:${mimeType};base64,${d.b64_json}`, mimeType }));
  if (images.length === 0) throw new Error("OpenAI returned no images");

  return {
    mode: inputImages.length > 0 ? "edit" : "generate",
    prompt,
    promptSent,
    settings,
    referenceImageName: referenceImage?.name,
    productImageName: productImage?.name,
    images,
    durationMs: Date.now() - started,
  };
}

/** Turns SDK errors into a message worth showing on the test page. */
export function describeOpenAIError(err: unknown): { message: string; status: number } {
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 502;
    const detail = err.message || "Unknown OpenAI error";
    return { message: `OpenAI API error${err.status ? ` (${err.status})` : ""}: ${detail}`, status };
  }
  return { message: err instanceof Error ? err.message : "Image generation failed", status: 500 };
}
