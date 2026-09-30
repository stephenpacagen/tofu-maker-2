// Visual QA for generated ad images using an OpenAI vision model via the Responses API.
// The model only judges individual checks; the score and pass/fail are calculated on the
// server in calculateQAScore().
import { calculateQAScore, readImageDimensions, validateAspectRatio } from "@/lib/image-qa/checks";
import { QA_IMAGE_DETAIL, QA_MODEL, QA_REASONING_EFFORT } from "@/lib/image-qa/config";
import type { AIQACategory, AIQAChecks, QACheck, QAExpectedOutput, QAResult, QASeverity } from "@/lib/image-qa/types";
import { describeOpenAIError, getOpenAIClient } from "./client";

export type QAImageInput = { bytes: Uint8Array; mimeType: string };

export type RunImageQAInput = {
  generatedImage: QAImageInput;
  /** Source of truth for product identity. Without it, product fidelity is not_applicable. */
  productImage?: QAImageInput;
  prompt: string;
  requestedCopy?: string;
  expected: QAExpectedOutput;
};

const AI_CATEGORIES: AIQACategory[] = ["productFidelity", "textSpelling", "unwantedLogos", "anatomy"];

const QA_INSTRUCTIONS = `You are an image quality-control system for AI-generated top-of-funnel advertising creatives.

Your job is NOT to judge whether an advertisement is beautiful, persuasive, creative, or likely to perform well. Your job is to identify concrete visual and textual defects that would make a generated advertisement unsuitable for use.

You will receive:
1. A generated advertisement image.
2. Optionally, a product reference image.
3. The original generation prompt.
4. Optionally, requested advertising copy.
5. The expected output requirements.

Evaluate the generated advertisement against those references and requirements. Report each check with a status, a severity, a one-sentence description, and evidence.

STATUS AND SEVERITY RULES
- "pass" means no meaningful defect. Use severity "none", or "minor" to note a small cosmetic issue that does not make the ad unusable.
- "fail" means a meaningful defect. Use severity "major" for a clear defect, or "critical" only for the critical cases listed under each check.
- "not_applicable" is only valid for productFidelity when no product reference image was provided. Use severity "none".
- For every fail, "evidence" must say concretely what is wrong and where it appears in the image (e.g. "bottom-left headline", "right hand near the product"). For passes, evidence may be an empty string.

PRODUCT FIDELITY (productFidelity)
When a product reference image is provided, treat it as the source of truth for the product's identity and appearance, and compare the product in the generated image against it. Do not merely check whether "a product" is present. Check whether:
- the same product is present;
- the overall physical shape matches;
- the packaging/container looks like the reference;
- the product colors are substantially correct;
- the label/packaging design is substantially consistent;
- the brand/product name on the product is consistent with the reference;
- the product has not been warped, melted, distorted, or substantially redesigned;
- the product has not been replaced with a generic-looking product;
- the product is not so obscured that it cannot reasonably be identified.
Minor differences caused by perspective, lighting, scale, shadows, reflections, or normal photographic variation are a pass. Material changes to shape, packaging, colors, branding, label, or identity are a fail.
Critical: the product is substantially different from the reference, replaced by a different/generic product, or severely distorted/unrecognizable.
If no product reference image is provided, return "not_applicable".

TEXT / SPELLING (textSpelling)
Inspect all visible text and list it in visibleText. Distinguish:
A) text intentionally requested in the prompt or requested copy;
B) product packaging/label text that matches the product reference (allowed; do not fail it for being present);
C) other text the generator added on its own;
D) gibberish or misspelled text.
Fail for: spelling errors in requested text, misspelled brand or product names, AI gibberish that a viewer would notice, or deviations from the requested copy. If no text was requested, fail if the generator added prominent unwanted text; small incidental or illegible background text is at most "minor".
Critical: required text is severely incorrect, missing its meaning, or misleading (e.g. wrong product name, wrong claim, garbled headline).
If the image contains no text and none was requested, pass.

UNWANTED OUTSIDE LOGOS (unwantedLogos)
Look for recognizable external company logos, competitor branding, unrelated brand names, watermarks (including stock-photo watermarks), and invented company logos. Logos and branding that are part of the supplied product reference, or brands explicitly named in the prompt or requested copy, are allowed. Do not fail an image because a legitimate logo appears on the product. When something fails, name the detected logo/branding in evidence.
Critical: an obvious outside company or competitor logo, or a visible stock-photo watermark.

PEOPLE / HANDS / ANATOMY (anatomy)
Look for obvious generation defects on people: extra, missing, or fused fingers; malformed hands; unnatural hand positions; duplicated, extra, or missing limbs; malformed arms or legs; obviously distorted faces; severely distorted body proportions; impossible anatomy.
Do NOT fail for unusual poses, unusual lighting, partial occlusion, stylization, or a hand partly outside the frame. Only fail for a meaningful defect that would make the ad look obviously AI-generated or unusable.
Critical: severe malformed anatomy that makes the image unusable.
If there are no people or body parts in the image, pass with a description saying so.

GENERAL
Be conservative about failures: only report a failure when there is meaningful evidence of a defect. Do not invent defects. Do not penalize creative choices because they differ from your aesthetic preference. Do not evaluate the image's aspect ratio or dimensions; that is checked separately. Do not produce an overall score.`;

// Strict JSON schema for Structured Outputs. Every field is required and no extras are
// allowed, so the model's reply always parses into AIQAChecks.
const checkSchema = (statuses: string[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["status", "severity", "description", "evidence"],
  properties: {
    status: { type: "string", enum: statuses },
    severity: { type: "string", enum: ["none", "minor", "major", "critical"] },
    description: { type: "string" },
    evidence: { type: "string" },
  },
});

const QA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["visibleText", ...AI_CATEGORIES],
  properties: {
    visibleText: { type: "array", items: { type: "string" } },
    productFidelity: checkSchema(["pass", "fail", "not_applicable"]),
    textSpelling: checkSchema(["pass", "fail"]),
    unwantedLogos: checkSchema(["pass", "fail"]),
    anatomy: checkSchema(["pass", "fail"]),
  },
};

const toDataUrl = (img: QAImageInput) => `data:${img.mimeType};base64,${Buffer.from(img.bytes).toString("base64")}`;

function buildContext(input: RunImageQAInput) {
  const expected = input.expected.size
    ? `${input.expected.size} pixels (aspect ratio ${input.expected.aspectRatio})`
    : `aspect ratio ${input.expected.aspectRatio}`;
  return [
    "ORIGINAL GENERATION PROMPT:",
    input.prompt,
    "",
    "REQUESTED ADVERTISING COPY:",
    input.requestedCopy?.trim() || "(none provided separately; use any text explicitly requested in the prompt)",
    "",
    "EXPECTED OUTPUT:",
    `${expected}. Dimensions are verified separately; do not evaluate them.`,
    "",
    "PRODUCT REFERENCE IMAGE:",
    input.productImage
      ? "Provided. It is the second image below and is the source of truth for product identity."
      : "Not provided. Return not_applicable for productFidelity.",
  ].join("\n");
}

/**
 * Makes the model's status/severity pair consistent: the status is authoritative, a fail
 * is at least "major", and a pass is at most "minor".
 */
function normalizeCheck(check: QACheck): QACheck {
  let severity: QASeverity = check.severity;
  if (check.status === "fail" && (severity === "none" || severity === "minor")) severity = "major";
  if (check.status === "pass" && (severity === "major" || severity === "critical")) severity = "minor";
  if (check.status === "not_applicable") severity = "none";
  return { ...check, severity, evidence: check.evidence?.trim() || undefined };
}

/** Calls the QA model. Throws on API errors, refusals, or unparseable output. */
async function runVisualQA(input: RunImageQAInput) {
  const openai = getOpenAIClient();

  // Images are sent inline as base64 data URLs in input_image blocks. The generated image
  // always comes first; the product reference (if any) second, labelled in text so the
  // model can't mix them up. Detail is QA_IMAGE_DETAIL ("low" to start, for cost).
  const content: Array<
    { type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: typeof QA_IMAGE_DETAIL }
  > = [
    { type: "input_text", text: buildContext(input) },
    { type: "input_text", text: "GENERATED ADVERTISEMENT IMAGE (the image to evaluate):" },
    { type: "input_image", image_url: toDataUrl(input.generatedImage), detail: QA_IMAGE_DETAIL },
  ];
  if (input.productImage) {
    content.push(
      { type: "input_text", text: "PRODUCT REFERENCE IMAGE (source of truth for the product):" },
      { type: "input_image", image_url: toDataUrl(input.productImage), detail: QA_IMAGE_DETAIL },
    );
  }

  const response = await openai.responses.create({
    model: QA_MODEL,
    instructions: QA_INSTRUCTIONS,
    input: [{ role: "user", content }],
    reasoning: { effort: QA_REASONING_EFFORT },
    text: { format: { type: "json_schema", name: "image_qa", strict: true, schema: QA_SCHEMA } },
  });

  if (response.status === "incomplete") {
    throw new Error(`QA model response was incomplete (${response.incomplete_details?.reason ?? "unknown reason"}).`);
  }
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type === "refusal") throw new Error(`QA model refused: ${part.refusal}`);
    }
  }

  let parsed: AIQAChecks;
  try {
    parsed = JSON.parse(response.output_text) as AIQAChecks;
  } catch {
    throw new Error("QA model returned output that was not valid JSON.");
  }
  if (AI_CATEGORIES.some((c) => !parsed[c]?.status)) throw new Error("QA model output was missing checks.");

  return { parsed, response };
}

/**
 * Runs the full QA pipeline for one generated image:
 * 1. deterministic aspect-ratio check from the actual image bytes;
 * 2. visual checks by the QA model;
 * 3. server-side weighted score and overall status.
 *
 * Never throws for QA-model failures: those become "error" checks (never passes) while
 * the deterministic aspect-ratio result is preserved.
 */
export async function runImageQA(input: RunImageQAInput): Promise<QAResult> {
  const started = Date.now();
  const aspectRatio = validateAspectRatio(readImageDimensions(input.generatedImage.bytes), input.expected);

  let aiChecks: Record<AIQACategory, QACheck>;
  let visibleText: string[] = [];
  let errorDetail: string | undefined;
  let usage: { inputTokens?: number; outputTokens?: number; responseId?: string } = {};

  try {
    const { parsed, response } = await runVisualQA(input);
    aiChecks = {
      productFidelity: normalizeCheck(parsed.productFidelity),
      textSpelling: normalizeCheck(parsed.textSpelling),
      unwantedLogos: normalizeCheck(parsed.unwantedLogos),
      anatomy: normalizeCheck(parsed.anatomy),
    };
    visibleText = parsed.visibleText ?? [];
    usage = {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      responseId: response.id,
    };
  } catch (err) {
    console.error("[image-qa]", err);
    errorDetail = describeOpenAIError(err, "QA request failed").message;
    const errored: QACheck = { status: "error", severity: "none", description: "Unable to complete QA check." };
    aiChecks = { productFidelity: errored, textSpelling: errored, unwantedLogos: errored, anatomy: errored };
  }

  // No product reference means there is nothing to compare against: never penalize.
  if (!input.productImage) {
    aiChecks.productFidelity = {
      status: "not_applicable",
      severity: "none",
      description: "No product reference image was provided.",
    };
  }

  const scored = calculateQAScore({ ...aiChecks, aspectRatio });
  return {
    ...scored,
    visibleText,
    errorDetail,
    debug: {
      model: QA_MODEL,
      imageDetail: QA_IMAGE_DETAIL,
      durationMs: Date.now() - started,
      productReferenceProvided: !!input.productImage,
      requestedCopyProvided: !!input.requestedCopy?.trim(),
      ...usage,
    },
  };
}
