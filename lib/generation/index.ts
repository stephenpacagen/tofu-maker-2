import { mockGenerator } from "./mock";
import { openaiGenerator } from "./openai";
import type { AdGenerator } from "./types";

const GENERATORS: Record<string, AdGenerator> = {
  mock: mockGenerator,
  openai: openaiGenerator,
};

export function getGenerator(): AdGenerator {
  const name = process.env.IMAGE_PROVIDER ?? "mock";
  const generator = GENERATORS[name];
  if (!generator) throw new Error(`Unknown IMAGE_PROVIDER "${name}"`);
  return generator;
}

export { buildPrompt } from "./prompt";
export type { AdGenerator, GenerationJob, ImageInput } from "./types";
