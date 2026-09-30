import { describeGeminiError, generateGeminiVariations } from "@/lib/gemini/image-generation";
import type { GeminiAspectRatio, GeminiImageModel } from "@/lib/gemini/image-generation-types";
import type { Dimension } from "@/lib/types";
import { orderedImages, toProviderFiles, type AdGenerator } from "./types";

const ASPECT_RATIOS: Record<Dimension, GeminiAspectRatio> = {
  "9x16": "9:16",
  "4x5": "4:5",
  "1x1": "1:1",
};

export const geminiGenerator: AdGenerator = {
  name: "gemini",
  async generate(job) {
    // Images go in the order the prompt describes them: format, style, then products.
    const files = toProviderFiles(orderedImages(job), "Gemini");
    try {
      const { succeeded, failed } = await generateGeminiVariations(job.prompt, files, {
        model: job.options.model as GeminiImageModel,
        aspectRatio: ASPECT_RATIOS[job.dimension],
        imageSize: job.options.geminiImageSize,
        n: job.count,
      });
      return {
        urls: succeeded.map((s) => s.variation.dataUrl),
        failures: failed.map((err) => describeGeminiError(err).message),
      };
    } catch (err) {
      throw new Error(describeGeminiError(err).message);
    }
  },
};
