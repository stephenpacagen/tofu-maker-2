// Shared between the test page (client) and the API route (server). Keep this
// file free of the OpenAI SDK so it never gets pulled into the browser bundle.

export const IMAGE_MODELS = ["gpt-image-2.5-sunburst"] as const;
export const IMAGE_QUALITIES = ["low", "medium", "high"] as const;
export const IMAGE_SIZES = [
  { value: "1024x1024", label: "Square (1024x1024)" },
  { value: "1024x1536", label: "Portrait (1024x1536)" },
  { value: "1536x1024", label: "Landscape (1536x1024)" },
] as const;
export const IMAGE_OUTPUT_FORMATS = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
] as const;
export const IMAGE_COUNTS = [1, 2, 3, 4] as const;

export type ImageModel = (typeof IMAGE_MODELS)[number];
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export type ImageSize = (typeof IMAGE_SIZES)[number]["value"];
export type ImageOutputFormat = (typeof IMAGE_OUTPUT_FORMATS)[number]["value"];
export type ImageCount = (typeof IMAGE_COUNTS)[number];

export const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;
export const REFERENCE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type ImageGenerationSettings = {
  model: ImageModel;
  quality: ImageQuality;
  size: ImageSize;
  outputFormat: ImageOutputFormat;
  n: ImageCount;
};

/**
 * Request sent by the browser as multipart/form-data to POST /api/image-generation.
 * Each settings field is a separate form field; `referenceImage` is an optional File.
 */
export type ImageGenerationRequest = ImageGenerationSettings & {
  prompt: string;
  /** Ad whose layout/style should be followed. */
  referenceImage?: File;
  /** Product that should appear in the generated ad. */
  productImage?: File;
};

export type GeneratedImage = {
  /** data: URL that can be used directly as an <img> src or download href. */
  dataUrl: string;
  mimeType: string;
};

export type ImageGenerationSuccess = {
  mode: "edit" | "generate";
  /** The prompt as typed by the user. */
  prompt: string;
  /** The prompt actually sent to OpenAI, including the image-role note when images are attached. */
  promptSent: string;
  settings: ImageGenerationSettings;
  referenceImageName?: string;
  productImageName?: string;
  images: GeneratedImage[];
  durationMs: number;
};

export type ImageGenerationError = { error: string };

export type ImageGenerationResponse = ImageGenerationSuccess | ImageGenerationError;
