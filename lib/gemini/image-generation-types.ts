// Shared between the Gemini test page (client) and its API route (server). Keep this
// file free of @google/genai so the SDK never gets pulled into the browser bundle.

export const GEMINI_IMAGE_MODELS = ["gemini-3.1-flash-image"] as const;
export const GEMINI_ASPECT_RATIOS = ["1:1", "4:5", "9:16", "16:9"] as const;
// The API expects "512" for the 0.5K tier; "K" must be uppercase.
export const GEMINI_IMAGE_SIZES = [
  { value: "512", label: "0.5K" },
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" },
] as const;

// The Interactions API returns one image per interaction, so each variation is a
// separate (separately billed) request run in parallel on the server.
export const GEMINI_VARIATION_COUNTS = [1, 2, 3, 4] as const;

export const MAX_GEMINI_REFERENCE_IMAGES = 3;
// Images are sent inline as base64 (~33% larger), and Gemini caps the total inline
// request size, so keep each file small enough that 3 of them still fit.
export const MAX_GEMINI_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024;
// Gemini caps an inline request at ~20MB; 14MB of raw images is ~19MB once base64-encoded.
export const MAX_GEMINI_TOTAL_IMAGE_BYTES = 14 * 1024 * 1024;
export const GEMINI_REFERENCE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type GeminiImageModel = (typeof GEMINI_IMAGE_MODELS)[number];
export type GeminiAspectRatio = (typeof GEMINI_ASPECT_RATIOS)[number];
export type GeminiImageSize = (typeof GEMINI_IMAGE_SIZES)[number]["value"];
export type GeminiVariationCount = (typeof GEMINI_VARIATION_COUNTS)[number];

export type GeminiImageSettings = {
  model: GeminiImageModel;
  aspectRatio: GeminiAspectRatio;
  imageSize: GeminiImageSize;
  /** Number of image variations to generate. */
  n: GeminiVariationCount;
};

/**
 * Request sent by the browser as multipart/form-data to POST /api/image-generation-gemini.
 * Settings are separate form fields; reference images are repeated `referenceImages` files,
 * in the order the user added them (reference image 1, 2, 3). `productImage` is optional.
 */
export type GeminiImageGenerationRequest = GeminiImageSettings & {
  prompt: string;
  referenceImages: File[];
  /** Product that should appear in the generated ad. Sent after the reference images. */
  productImage?: File;
};

export type GeminiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  totalTokens?: number;
};

/** One generated variation, with the non-sensitive metadata of the interaction that made it. */
export type GeminiVariation = {
  /** data: URL usable directly as an <img> src or download href. */
  dataUrl: string;
  mimeType: string;
  /** Any text the model returned alongside this image. */
  text?: string;
  interactionId?: string;
  status?: string;
  created?: string;
  durationMs: number;
  usage?: GeminiUsage;
};

/** Non-sensitive metadata from the Gemini responses, shown in the Debug Info panel. */
export type GeminiResponseDebug = {
  modelVersion?: string;
  requested: number;
  succeeded: number;
  /** Summed across all successful variations. */
  usage?: GeminiUsage;
};

export type GeminiImageGenerationSuccess = {
  /** The prompt as typed by the user. */
  prompt: string;
  /** The text actually sent to Gemini, including the product-image note when one is attached. */
  promptSent: string;
  settings: GeminiImageSettings;
  referenceImageNames: string[];
  productImageName?: string;
  images: GeminiVariation[];
  /** Error messages for variations that failed while others succeeded. */
  failures: string[];
  /** Wall-clock time for the whole batch (variations run in parallel). */
  durationMs: number;
  debug: GeminiResponseDebug;
};

export type GeminiImageGenerationError = { error: string };

export type GeminiImageGenerationResponse = GeminiImageGenerationSuccess | GeminiImageGenerationError;
