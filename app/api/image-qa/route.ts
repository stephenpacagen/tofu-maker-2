import type { QAResponse } from "@/lib/image-qa/types";
import { runImageQA, type QAImageInput } from "@/lib/openai/image-qa";

export const maxDuration = 120;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_LENGTH = 32000;

async function readImage(value: FormDataEntryValue | null, label: string): Promise<QAImageInput | undefined | string> {
  if (!(value instanceof File) || value.size === 0) return undefined;
  if (!IMAGE_TYPES.includes(value.type)) return `${label} must be PNG, JPEG, or WebP`;
  if (value.size > MAX_IMAGE_BYTES) return `${label} must be smaller than 25MB`;
  return { bytes: new Uint8Array(await value.arrayBuffer()), mimeType: value.type };
}

/**
 * POST multipart/form-data:
 * - generatedImage (File, required): the image to check
 * - productImage (File, optional): product reference, source of truth for product fidelity
 * - prompt (required), requestedCopy (optional)
 * - expectedAspectRatio (required, "W:H"), expectedSize (optional, "WIDTHxHEIGHT")
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data" } satisfies QAResponse, { status: 400 });
  }

  const bad = (error: string) => Response.json({ error } satisfies QAResponse, { status: 400 });

  const generatedImage = await readImage(form.get("generatedImage"), "Generated image");
  if (typeof generatedImage === "string") return bad(generatedImage);
  if (!generatedImage) return bad("Generated image is required");
  const productImage = await readImage(form.get("productImage"), "Product image");
  if (typeof productImage === "string") return bad(productImage);

  const prompt = String(form.get("prompt") ?? "").trim();
  if (!prompt) return bad("Prompt is required");
  const requestedCopy = String(form.get("requestedCopy") ?? "").trim();
  if (prompt.length > MAX_TEXT_LENGTH || requestedCopy.length > MAX_TEXT_LENGTH) return bad("Prompt or copy is too long");

  const aspectRatio = String(form.get("expectedAspectRatio") ?? "");
  if (!/^\d+:\d+$/.test(aspectRatio)) return bad("expectedAspectRatio must look like 4:5");
  const size = String(form.get("expectedSize") ?? "") || undefined;
  if (size && !/^\d+x\d+$/.test(size)) return bad("expectedSize must look like 1024x1536");

  // runImageQA does not throw for QA-model failures; it returns status "error" with the
  // deterministic aspect-ratio result preserved.
  const result = await runImageQA({
    generatedImage,
    productImage,
    prompt,
    requestedCopy: requestedCopy || undefined,
    expected: { aspectRatio, size },
  });
  return Response.json(result satisfies QAResponse);
}
