import { countAds, planBatches } from "@/lib/batches";
import { BRANDS } from "@/lib/brands";
import { toReferenceBreakdown } from "@/lib/breakdown";
import { buildPrompt, getGenerator, referenceCoversBoth, type ImageInput } from "@/lib/generation";
import {
  GEMINI_IMAGE_SIZES,
  IMAGE_QUALITIES,
  MAX_IMAGES_PER_REQUEST,
  isGenerationModel,
  type GenerateChunk,
  type GenerateChunkResponse,
  type GenerationOptions,
} from "@/lib/generation/models";
import {
  DIMENSIONS,
  MAX_REFERENCE_GROUPS,
  MAX_TOTAL_ADS,
  MAX_VARIATIONS_PER_REFERENCE,
  MIN_VARIATIONS_PER_REFERENCE,
  REFERENCE_ROLES,
  type AdBrief,
  type GeneratedAd,
} from "@/lib/types";

export const maxDuration = 300;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function toImageInput(value: FormDataEntryValue | null): Promise<ImageInput | undefined> {
  if (!(value instanceof File)) return undefined;
  if (!value.type.startsWith("image/")) throw new Error(`${value.name} is not an image`);
  if (value.size > MAX_IMAGE_BYTES) throw new Error(`${value.name} is larger than 10MB`);
  return { name: value.name, type: value.type, bytes: await value.arrayBuffer() };
}

function validateBrief(brief: AdBrief): string | null {
  const brand = BRANDS.find((b) => b.name === brief.brand);
  if (!brand) return "Unknown brand";
  if (brief.products?.length !== 1) return "Select one product";
  if (brief.products.some((p) => !brand.products.some((bp) => bp.id === p.id)))
    return `Unknown product for ${brand.name}`;
  if (!brief.dimensions?.length || brief.dimensions.some((d) => !DIMENSIONS.includes(d)))
    return "Pick at least one valid dimension";
  if (brief.productVisibility !== "secondary" && brief.productVisibility !== "none")
    return "Product visibility must be secondary or none";
  if ((brief.landingPages?.length ?? 0) > 5) return "Attach at most 5 landing pages";
  if (!Array.isArray(brief.references) || brief.references.some((r) => !REFERENCE_ROLES.includes(r.role)))
    return "Each reference must be a style or format reference";
  if (!Array.isArray(brief.referenceGroups) || brief.referenceGroups.length === 0)
    return "Add at least one reference group";
  if (brief.referenceGroups.length > MAX_REFERENCE_GROUPS)
    return `Use at most ${MAX_REFERENCE_GROUPS} reference groups`;
  const groupIds = new Set(brief.referenceGroups.map((g) => g.id));
  if (brief.references.some((r) => !groupIds.has(r.groupId))) return "Reference belongs to an unknown group";
  const emptyGroup = brief.referenceGroups.findIndex((g) => !brief.references.some((r) => r.groupId === g.id));
  if (emptyGroup !== -1) return `Group ${emptyGroup + 1} needs at least one style or format reference`;
  if (
    !Number.isInteger(brief.targetAds) ||
    brief.targetAds < MIN_VARIATIONS_PER_REFERENCE ||
    brief.targetAds > MAX_VARIATIONS_PER_REFERENCE
  )
    return `Variations per reference must be ${MIN_VARIATIONS_PER_REFERENCE}-${MAX_VARIATIONS_PER_REFERENCE}`;
  if (countAds(brief) > MAX_TOTAL_ADS) return `A single run is capped at ${MAX_TOTAL_ADS} ads`;
  return null;
}

function validateChunk(brief: AdBrief, chunk: GenerateChunk): string | null {
  const batch = planBatches(brief).find((b) => b.id === chunk.groupId);
  if (!batch) return "Unknown reference group";
  const job = batch.jobs.find(
    (j) => (j.style?.id ?? null) === chunk.styleRefId && (j.format?.id ?? null) === chunk.formatRefId,
  );
  if (!job) return "That style/format pairing is not in the plan for this group";
  if (!brief.dimensions.includes(chunk.dimension)) return "Dimension is not part of the brief";
  if (!Number.isInteger(chunk.count) || chunk.count < 1 || chunk.count > Math.min(job.count, MAX_IMAGES_PER_REQUEST))
    return `Each request makes 1-${MAX_IMAGES_PER_REQUEST} images, up to the pairing's planned count`;
  if (!Number.isInteger(chunk.variationStart) || chunk.variationStart < 1) return "Invalid variation number";
  return null;
}

function validateOptions(options: GenerationOptions): string | null {
  if (!isGenerationModel(options?.model)) return "Unknown image model";
  if (!IMAGE_QUALITIES.includes(options.openaiQuality)) return "Invalid OpenAI quality";
  if (!GEMINI_IMAGE_SIZES.some((s) => s.value === options.geminiImageSize)) return "Invalid Gemini image size";
  return null;
}

/**
 * Generates the images for one chunk of the reviewed brief: one style/format pairing
 * of one reference group, in one dimension (see GenerateChunk). The browser splits the
 * whole brief into chunks and calls this in parallel, so results stream in and no single
 * request runs long enough to time out.
 *
 * multipart/form-data fields:
 * - brief: the reviewed AdBrief JSON (same as the review step's "Brief JSON")
 * - chunk: GenerateChunk JSON
 * - options: GenerationOptions JSON (model + quality/size)
 * - reference:<id>: the style and/or format reference image used by this chunk
 * - product:<id>: optional product photos, sent to the model after the references
 */
export async function POST(request: Request) {
  let brief: AdBrief;
  let chunk: GenerateChunk;
  let options: GenerationOptions;
  let form: FormData;
  try {
    form = await request.formData();
    brief = JSON.parse(String(form.get("brief")));
    chunk = JSON.parse(String(form.get("chunk")));
    options = JSON.parse(String(form.get("options")));
  } catch {
    return Response.json({ error: "Invalid request body" } satisfies GenerateChunkResponse, { status: 400 });
  }

  const invalid = validateBrief(brief) ?? validateChunk(brief, chunk) ?? validateOptions(options);
  if (invalid) return Response.json({ error: invalid } satisfies GenerateChunkResponse, { status: 400 });

  // Log the group's creative breakdown (the brief JSON this generation is driven by)
  // once per group, on its first chunk.
  if (chunk.variationStart === 1 && chunk.dimension === brief.dimensions[0]) {
    const brandId = BRANDS.find((b) => b.name === brief.brand)!.id;
    const index = brief.referenceGroups.findIndex((g) => g.id === chunk.groupId);
    const breakdown = toReferenceBreakdown(brief, brandId).reference_groups.find(
      (b) => b.reference_group === index + 1,
    );
    console.log(`[generate] group ${index + 1} breakdown\n${JSON.stringify(breakdown, null, 2)}`);
  }

  try {
    const style = chunk.styleRefId ? brief.references.find((r) => r.id === chunk.styleRefId)! : null;
    const format = chunk.formatRefId ? brief.references.find((r) => r.id === chunk.formatRefId)! : null;

    const coversBoth = referenceCoversBoth({ format, style });
    const styleImage =
      style && !coversBoth ? await toImageInput(form.get(`reference:${style.id}`)) : undefined;
    const formatImage = format ? await toImageInput(form.get(`reference:${format.id}`)) : undefined;
    if (style && !coversBoth && !styleImage) throw new Error(`Missing image for style reference ${style.fileName}`);
    if (format && !formatImage) throw new Error(`Missing image for format reference ${format.fileName}`);

    // Product photos are optional; when present they're sent after the references and
    // the prompt describes them as the real product.
    const productImages: ImageInput[] = [];
    if (brief.productVisibility === "secondary") {
      for (const p of brief.products) {
        const image = await toImageInput(form.get(`product:${p.id}`));
        if (image) productImages.push(image);
      }
    }

    const prompt = buildPrompt(brief, { format, style, productPhotoCount: productImages.length }, chunk.dimension);
    const generator = getGenerator(options.model);
    const { urls, failures } = await generator.generate({
      brief,
      formatImage,
      styleImage,
      productImages,
      dimension: chunk.dimension,
      count: chunk.count,
      prompt,
      options,
    });

    const ads: GeneratedAd[] = urls.map((imageUrl, i) => {
      const variation = chunk.variationStart + i;
      return {
        id: `${chunk.groupId}-${style?.id ?? "none"}-${format?.id ?? "none"}-${chunk.dimension}-${variation}`,
        batchId: chunk.groupId,
        styleRefId: style?.id ?? null,
        formatRefId: format?.id ?? null,
        dimension: chunk.dimension,
        variation,
        imageUrl,
        prompt,
      };
    });

    return Response.json({ provider: generator.name, model: options.model, ads, failures } satisfies GenerateChunkResponse);
  } catch (error) {
    console.error("[generate]", error);
    const message = error instanceof Error ? error.message : "Generation failed";
    return Response.json({ error: message } satisfies GenerateChunkResponse, { status: 502 });
  }
}
