import { describeOpenAIError } from "@/lib/openai/client";
import { generateOpenAIImages } from "@/lib/openai/image-generation";
import type { Dimension } from "@/lib/types";
import { orderedImages, toProviderFiles, type AdGenerator } from "./types";

// gpt-image-2.5 accepts custom WIDTHxHEIGHT sizes (both divisible by 16), so each
// dimension gets its exact ratio.
const SIZES: Record<Dimension, string> = {
  "9x16": "864x1536",
  "4x5": "1024x1280",
  "1x1": "1024x1024",
};

export const openaiGenerator: AdGenerator = {
  name: "openai",
  async generate(job) {
    // Images go in the order the prompt describes them: format, style, then products.
    const files = toProviderFiles(orderedImages(job), "OpenAI");
    try {
      const { images, failures } = await generateOpenAIImages(job.prompt, files, {
        model: job.options.model,
        quality: job.options.openaiQuality,
        size: SIZES[job.dimension],
        outputFormat: "png",
        n: job.count,
      });
      return { urls: images.map((img) => img.dataUrl), failures };
    } catch (err) {
      throw new Error(describeOpenAIError(err).message);
    }
  },
};
