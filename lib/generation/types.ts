import type { AdBrief, Dimension } from "@/lib/types";
import type { GenerationOptions } from "./models";

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
  /** The finished ad being revised. Sent after the original references and product photos. */
  revisionImage?: ImageInput;
  /** Extra images supplied for a revision, sent after the current ad. */
  extraImages?: ImageInput[];
  dimension: Dimension;
  count: number;
  prompt: string;
  options: GenerationOptions;
};

export type GenerationOutput = {
  /** One image URL (data: or https:) per image that succeeded. */
  urls: string[];
  /** Errors for images that failed while others in the same call succeeded. */
  failures: string[];
};

export interface AdGenerator {
  name: string;
  /** Throws if nothing could be generated. */
  generate(job: GenerationJob): Promise<GenerationOutput>;
}

/** Order in which images are sent to the model; the prompt describes them in this order. */
export function orderedImages(
  job: Pick<GenerationJob, "formatImage" | "styleImage" | "productImages" | "revisionImage" | "extraImages">,
) {
  return [job.formatImage, job.styleImage, ...job.productImages, job.revisionImage, ...(job.extraImages ?? [])].filter(
    (img): img is ImageInput => !!img,
  );
}

const PROVIDER_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Converts job images to Files for the real providers, which only accept PNG/JPEG/WebP. */
export function toProviderFiles(images: ImageInput[], provider: string): File[] {
  return images.map((img) => {
    if (!PROVIDER_IMAGE_TYPES.includes(img.type)) {
      throw new Error(`${img.name} is ${img.type || "an unknown type"}; ${provider} only accepts PNG, JPEG, or WebP.`);
    }
    return new File([img.bytes], img.name, { type: img.type });
  });
}
