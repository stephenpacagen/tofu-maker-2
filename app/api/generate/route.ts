import { countAds, planBatches } from "@/lib/batches";
import { BRANDS } from "@/lib/brands";
import { toCreativeBreakdowns } from "@/lib/breakdown";
import { buildPrompt, getGenerator, type ImageInput } from "@/lib/generation";
import {
  DIMENSIONS,
  MAX_REFERENCE_GROUPS,
  MAX_TOTAL_ADS,
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
  if (!brief.products?.length) return "Select at least one product";
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
  if (!Number.isInteger(brief.targetAds) || brief.targetAds < 1) return "Target number of ads must be at least 1";
  if (countAds(brief) > MAX_TOTAL_ADS) return `A single run is capped at ${MAX_TOTAL_ADS} ads`;
  return null;
}

export async function POST(request: Request) {
  let brief: AdBrief;
  let form: FormData;
  try {
    form = await request.formData();
    brief = JSON.parse(String(form.get("brief")));
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const invalid = validateBrief(brief);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const brandId = BRANDS.find((b) => b.name === brief.brand)!.id;
  console.log("[generate] creative breakdown\n" + JSON.stringify(toCreativeBreakdowns(brief, brandId), null, 2));

  try {
    const generator = getGenerator();

    const referenceImages = new Map<string, ImageInput>();
    for (const r of brief.references) {
      const image = await toImageInput(form.get(`reference:${r.id}`));
      if (!image) throw new Error(`Missing image for reference ${r.fileName}`);
      referenceImages.set(r.id, image);
    }

    const productImages: ImageInput[] = [];
    if (brief.productVisibility === "secondary") {
      for (const p of brief.products) {
        const image = await toImageInput(form.get(`product:${p.id}`));
        if (image) productImages.push(image);
      }
    }

    const ads: GeneratedAd[] = [];
    for (const batch of planBatches(brief)) {
      let variation = 0;
      for (const job of batch.jobs) {
        for (const dimension of brief.dimensions) {
          const prompt = buildPrompt(
            brief,
            { format: job.format, style: job.style, productPhotoCount: productImages.length },
            dimension,
          );
          const urls = await generator.generate({
            brief,
            formatImage: job.format ? referenceImages.get(job.format.id) : undefined,
            styleImage: job.style ? referenceImages.get(job.style.id) : undefined,
            productImages,
            dimension,
            count: job.count,
            prompt,
          });
          urls.forEach((imageUrl, i) =>
            ads.push({
              id: `${batch.id}-${job.style?.id ?? "none"}-${job.format?.id ?? "none"}-${dimension}-${i + 1}`,
              batchId: batch.id,
              styleRefId: job.style?.id ?? null,
              formatRefId: job.format?.id ?? null,
              dimension,
              variation: variation + i + 1,
              imageUrl,
              prompt,
            }),
          );
        }
        variation += job.count;
      }
    }

    return Response.json({ provider: generator.name, ads });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
