import { geminiGenerator } from "./gemini";
import { mockGenerator } from "./mock";
import { providerOf, type GenerationModelId, type GenerationProvider } from "./models";
import { openaiGenerator } from "./openai";
import type { AdGenerator } from "./types";

const GENERATORS: Record<GenerationProvider, AdGenerator> = {
  mock: mockGenerator,
  openai: openaiGenerator,
  gemini: geminiGenerator,
};

/** Picks the provider for the model chosen on the review step. */
export function getGenerator(model: GenerationModelId): AdGenerator {
  return GENERATORS[providerOf(model)];
}

export { buildPrompt, buildRegeneratePrompt, buildFollowUpPrompt, buildResizePrompt, referenceCoversBoth } from "./prompt";
export {
  SAFE_ZONE_REFERENCE,
  SAFE_ZONE_POLYGON_9X16,
  SAFE_ZONE_CONTENT_9X16,
  textSafeZonePolygon,
  textSafeZoneContentRegions,
  textSafeZoneInsets,
  textSafeZonePolygonPath,
  textSafeZonePrompt,
} from "./safe-zone";
export type { AdGenerator, GenerationJob, GenerationOutput, ImageInput } from "./types";
