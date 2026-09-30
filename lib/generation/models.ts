// Image models the ad workflow can generate with, and the per-run options. Client-safe:
// no SDK imports, so the review step can render the picker from this list.
import { GEMINI_IMAGE_MODELS, GEMINI_IMAGE_SIZES, type GeminiImageSize } from "@/lib/gemini/image-generation-types";
import { IMAGE_MODELS, IMAGE_QUALITIES, type ImageQuality } from "@/lib/openai/image-generation-types";

export type GenerationProvider = "openai" | "gemini" | "mock";

export const GENERATION_MODELS = [
  ...IMAGE_MODELS.map((id) => ({ id, label: `OpenAI · ${id}`, provider: "openai" as const })),
  ...GEMINI_IMAGE_MODELS.map((id) => ({ id, label: `Gemini · ${id}`, provider: "gemini" as const })),
  { id: "mock" as const, label: "Mock (no API call, free)", provider: "mock" as const },
];

export type GenerationModelId = (typeof GENERATION_MODELS)[number]["id"];

export type GenerationOptions = {
  model: GenerationModelId;
  /** Used when the model is OpenAI. */
  openaiQuality: ImageQuality;
  /** Used when the model is Gemini. */
  geminiImageSize: GeminiImageSize;
};

export const DEFAULT_GENERATION_OPTIONS: GenerationOptions = {
  model: IMAGE_MODELS[0],
  openaiQuality: "medium",
  geminiImageSize: "1K",
};

export { GEMINI_IMAGE_SIZES, IMAGE_QUALITIES };

/**
 * Each /api/generate call makes at most this many images (one group pairing, one
 * dimension), so a single request stays well inside the route's time limit.
 */
export const MAX_IMAGES_PER_REQUEST = 4;

/** How many /api/generate calls the browser runs at once. Keeps provider rate limits happy. */
export const GENERATION_CONCURRENCY = 3;

export const providerOf = (model: GenerationModelId): GenerationProvider =>
  GENERATION_MODELS.find((m) => m.id === model)?.provider ?? "mock";

export const isGenerationModel = (value: unknown): value is GenerationModelId =>
  GENERATION_MODELS.some((m) => m.id === value);

/**
 * One /api/generate call: a single style/format pairing from the review step's plan
 * (one entry of a group's `pairings` in the brief JSON), in one dimension.
 */
export type GenerateChunk = {
  groupId: string;
  styleRefId: string | null;
  formatRefId: string | null;
  dimension: import("@/lib/types").Dimension;
  count: number;
  /** Variation number of the first image in this chunk, within its group. */
  variationStart: number;
};

export type GenerateChunkResponse =
  | { provider: string; model: GenerationModelId; ads: import("@/lib/types").GeneratedAd[]; failures: string[] }
  | { error: string };
