import type { AdBrief, Dimension } from "@/lib/types";

export type ImageInput = {
  name: string;
  type: string;
  bytes: ArrayBuffer;
};

/** At least one of `formatImage` and `styleImage` is always set. */
export type GenerationJob = {
  brief: AdBrief;
  formatImage?: ImageInput;
  styleImage?: ImageInput;
  productImages: ImageInput[];
  dimension: Dimension;
  count: number;
  prompt: string;
};

/** Returns one image URL (data: or https:) per requested variation. */
export interface AdGenerator {
  name: string;
  generate(job: GenerationJob): Promise<string[]>;
}

/** Order in which images are sent to the model; the prompt describes them in this order. */
export function orderedImages(job: Pick<GenerationJob, "formatImage" | "styleImage" | "productImages">) {
  return [job.formatImage, job.styleImage, ...job.productImages].filter((img): img is ImageInput => !!img);
}
