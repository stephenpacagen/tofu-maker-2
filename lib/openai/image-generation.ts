import { toFile } from "openai";
import { describeOpenAIError, getOpenAIClient } from "./client";
import type { GeneratedImage, ImageGenerationRequest, ImageGenerationSuccess } from "./image-generation-types";

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

export type OpenAIImageSettings = {
  model: string;
  quality: ImageGenerationRequest["quality"];
  /** "WIDTHxHEIGHT". The standard sizes always work; gpt-image-2.5 also accepts custom sizes. */
  size: string;
  outputFormat: ImageGenerationRequest["outputFormat"];
  n: number;
};

/**
 * Low-level call used by both the test page and the main ad workflow: the caller has
 * already built the full prompt and ordered the input images.
 *
 * With input images we call the Images edit endpoint (POST /v1/images/edits). Each File
 * is converted with the SDK's toFile() helper and sent as the multipart `image[]` array
 * alongside the prompt, in the given order. With no images, we call the generate
 * endpoint for pure text-to-image.
 */
export async function generateOpenAIImages(prompt: string, files: File[], settings: OpenAIImageSettings) {
  const openai = getOpenAIClient();
  const mimeType = MIME_TYPES[settings.outputFormat];
  const uploads = await Promise.all(files.map(toUpload));

  // One Images API call asking for `n` images.
  async function request(n: number): Promise<GeneratedImage[]> {
    const params = {
      model: settings.model,
      prompt,
      quality: settings.quality,
      size: settings.size,
      output_format: settings.outputFormat,
      n,
    };
    const response =
      uploads.length > 0 ? await openai.images.edit({ ...params, image: uploads }) : await openai.images.generate(params);

    // Diagnostics for count mismatches: how many entries came back vs. how many had image data.
    const raw = response.data ?? [];
    const withData = raw.filter((d) => d.b64_json).length;
    if (withData < n) {
      console.warn(
        `[image-generation] ${uploads.length > 0 ? "edit" : "generate"} endpoint, ${uploads.length} input image(s): ` +
          `asked for ${n}, got ${raw.length} entries, ${withData} with image data` +
          (raw.length > withData ? ` (${raw.length - withData} entries had no b64_json)` : "") +
          `; output_tokens=${response.usage?.output_tokens ?? "n/a"}`,
      );
    }

    // GPT image models always return base64 (b64_json) rather than URLs. We wrap each
    // one in a data: URL so the browser can render and download it without another request.
    return raw
      .filter((d): d is typeof d & { b64_json: string } => !!d.b64_json)
      .map((d) => ({ dataUrl: `data:${mimeType};base64,${d.b64_json}`, mimeType }));
  }

  const images = await request(settings.n);
  if (images.length === 0) throw new Error("OpenAI returned no images");
  const firstCallCount = images.length;

  // The API can return fewer images than `n` asked for. Fill the gap with parallel
  // single-image requests so the user gets the count they picked. A failed top-up
  // doesn't discard the images we already have.
  const failures: string[] = [];
  if (images.length < settings.n) {
    const extra = await Promise.allSettled(Array.from({ length: settings.n - images.length }, () => request(1)));
    for (const outcome of extra) {
      if (outcome.status === "fulfilled") images.push(...outcome.value);
      else failures.push(describeOpenAIError(outcome.reason).message);
    }
  }

  return { images, firstCallCount, failures };
}

export async function generateImages(req: ImageGenerationRequest): Promise<ImageGenerationSuccess> {
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

  const { images, firstCallCount, failures } = await generateOpenAIImages(
    promptSent,
    inputImages.map((img) => img.file),
    settings,
  );

  return {
    mode: inputImages.length > 0 ? "edit" : "generate",
    prompt,
    promptSent,
    settings,
    referenceImageName: referenceImage?.name,
    productImageName: productImage?.name,
    images,
    firstCallCount,
    failures,
    durationMs: Date.now() - started,
  };
}

// Re-exported so the image-generation route keeps its existing import.
export { describeOpenAIError };
