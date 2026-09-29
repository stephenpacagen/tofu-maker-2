"use client";

// Temporary Step 3 test page for image generation. Picks OpenAI or Gemini based on the
// selected model and talks only to our own API routes; no API key reaches the browser.

import { useState } from "react";
import { DropZone } from "@/app/components/DropZone";
import {
  GEMINI_ASPECT_RATIOS,
  GEMINI_IMAGE_MODELS,
  GEMINI_IMAGE_SIZES,
  GEMINI_VARIATION_COUNTS,
  MAX_GEMINI_REFERENCE_IMAGE_BYTES,
  MAX_GEMINI_REFERENCE_IMAGES,
  type GeminiImageGenerationResponse,
  type GeminiImageSettings,
} from "@/lib/gemini/image-generation-types";
import {
  IMAGE_COUNTS,
  IMAGE_MODELS,
  IMAGE_OUTPUT_FORMATS,
  IMAGE_QUALITIES,
  IMAGE_SIZES,
  MAX_REFERENCE_IMAGE_BYTES,
  REFERENCE_IMAGE_TYPES,
  type ImageGenerationResponse,
  type ImageGenerationSettings,
} from "@/lib/openai/image-generation-types";

const selectClass =
  "w-full rounded-lg border border-zinc-300 bg-white py-2 pr-9 pl-3 text-sm focus:border-brand focus:outline-none";
const labelClass = "mb-1 block text-sm font-medium text-zinc-700";

type Provider = "openai" | "gemini";
type Model = ImageGenerationSettings["model"] | GeminiImageSettings["model"];

const PROVIDERS: Record<
  Provider,
  { label: string; endpoint: string; maxReferences: number; maxBytes: number }
> = {
  openai: {
    label: "OpenAI",
    endpoint: "/api/image-generation",
    maxReferences: 1,
    maxBytes: MAX_REFERENCE_IMAGE_BYTES,
  },
  gemini: {
    label: "Gemini",
    endpoint: "/api/image-generation-gemini",
    maxReferences: MAX_GEMINI_REFERENCE_IMAGES,
    maxBytes: MAX_GEMINI_REFERENCE_IMAGE_BYTES,
  },
};

const providerOf = (model: Model): Provider =>
  (GEMINI_IMAGE_MODELS as readonly string[]).includes(model)
    ? "gemini"
    : "openai";

const toMB = (bytes: number) => `${bytes / 1024 / 1024}MB`;
const extension = (mimeType: string) =>
  (mimeType.split("/")[1] ?? "png").replace("jpeg", "jpg");
const labelFor = (
  options: readonly { value: string; label: string }[],
  v: string,
) => options.find((o) => o.value === v)?.label ?? v;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

type PickedImage = { id: number; file: File; previewUrl: string };
type Row = [label: string, value: string];

/** Provider-agnostic view of a finished generation, so both render the same way. */
type Result = {
  id: number;
  provider: Provider;
  prompt: string;
  promptSent: string;
  settings: Row[];
  images: { dataUrl: string; mimeType: string; text?: string }[];
  /** Errors for variations that failed while others succeeded. */
  failures?: string[];
  debug?: Row[];
};

type Success =
  | Exclude<ImageGenerationResponse, { error: string }>
  | Exclude<GeminiImageGenerationResponse, { error: string }>;

function toResult(json: Success): Result {
  const id = Date.now();
  // Only the OpenAI response has `mode`; both have `images`.
  if ("mode" in json) {
    return {
      id,
      provider: "openai",
      prompt: json.prompt,
      promptSent: json.promptSent,
      images: json.images,
      settings: [
        ["Model", json.settings.model],
        ["Mode", json.mode === "edit" ? "Image edit" : "Text-to-image"],
        ["Quality", json.settings.quality],
        ["Size", labelFor(IMAGE_SIZES, json.settings.size)],
        ["Format", labelFor(IMAGE_OUTPUT_FORMATS, json.settings.outputFormat)],
        ["Images", `${json.images.length} of ${json.settings.n}`],
        ["Reference", json.referenceImageName ?? "none"],
        ["Product", json.productImageName ?? "none"],
        ["Time", seconds(json.durationMs)],
      ],
    };
  }

  const d = json.debug;
  const refNames = json.referenceImageNames;
  return {
    id,
    provider: "gemini",
    prompt: json.prompt,
    promptSent: json.promptSent,
    images: json.images,
    failures: json.failures,
    settings: [
      ["Model", json.settings.model],
      ["Aspect ratio", json.settings.aspectRatio],
      ["Image size", labelFor(GEMINI_IMAGE_SIZES, json.settings.imageSize)],
      ["Images", `${json.images.length} of ${json.settings.n}`],
      ["Reference images", String(refNames.length)],
      ["Product", json.productImageName ?? "none"],
      ["Time", seconds(json.durationMs)],
    ],
    debug: [
      ["Model used", d.modelVersion ?? json.settings.model],
      ["Aspect ratio", json.settings.aspectRatio],
      [
        "Image size",
        `${labelFor(GEMINI_IMAGE_SIZES, json.settings.imageSize)} (${json.settings.imageSize})`,
      ],
      [
        "Reference images",
        refNames.length
          ? `${refNames.length} (${refNames.map((n, i) => `${i + 1}: ${n}`).join(", ")})`
          : "0",
      ],
      ["Product image", json.productImageName ?? "none"],
      ["Generation time", `${seconds(json.durationMs)} (variations run in parallel)`],
      ["Variations", `${d.succeeded} succeeded of ${d.requested} requested`],
      ...json.images.flatMap((v, i): Row[] => [
        [`#${i + 1} interaction ID`, v.interactionId ?? "n/a"],
        [`#${i + 1} status`, `${v.status ?? "n/a"} · ${seconds(v.durationMs)} · ${v.mimeType}`],
      ]),
      ...(d.usage
        ? ([
            ["Input tokens", String(d.usage.inputTokens ?? "n/a")],
            ["Output tokens", String(d.usage.outputTokens ?? "n/a")],
            ["Thought tokens", String(d.usage.thoughtTokens ?? "n/a")],
            ["Total tokens (all variations)", String(d.usage.totalTokens ?? "n/a")],
          ] satisfies Row[])
        : []),
    ],
  };
}

function ImagePreviewCard({
  label,
  image,
  onRemove,
}: {
  label: string;
  image: PickedImage;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.previewUrl}
        alt={`${label} preview`}
        className="h-36 w-full rounded-lg bg-zinc-50 object-contain"
      />
      <p className="mt-2 text-xs font-medium text-zinc-700">{label}</p>
      <p className="truncate text-xs text-zinc-500" title={image.file.name}>
        {image.file.name}
      </p>
      <button
        type="button"
        onClick={onRemove}
        className="mt-1 text-xs text-red-600 hover:underline"
      >
        Remove
      </button>
    </div>
  );
}

function UploadTile({
  hint,
  multiple,
  ariaLabel,
  onFiles,
}: {
  hint: string;
  multiple?: boolean;
  ariaLabel: string;
  onFiles: (files: FileList | null) => void;
}) {
  return (
    <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-white px-3 py-6 text-center text-sm text-zinc-500 hover:border-zinc-400">
      <span>Drop or click to add</span>
      <span className="text-xs">{hint}</span>
      <input
        type="file"
        multiple={multiple}
        accept={REFERENCE_IMAGE_TYPES.join(",")}
        className="sr-only"
        aria-label={ariaLabel}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

export default function ImageGenerationTestPage() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<Model>(IMAGE_MODELS[0]);
  // Object URLs are created/revoked together with the file so previews never leak.
  const [references, setReferences] = useState<PickedImage[]>([]);
  const [product, setProduct] = useState<PickedImage | null>(null);
  const [openaiSettings, setOpenaiSettings] = useState<
    Omit<ImageGenerationSettings, "model">
  >({
    quality: "medium",
    size: "1024x1024",
    outputFormat: "png",
    n: 1,
  });
  const [geminiSettings, setGeminiSettings] = useState<
    Omit<GeminiImageSettings, "model">
  >({
    aspectRatio: "4:5",
    imageSize: "1K",
    n: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  const provider = providerOf(model);
  const limits = PROVIDERS[provider];
  const slotsLeft = Math.max(0, limits.maxReferences - references.length);
  // Switching Gemini -> OpenAI can leave more references than OpenAI accepts, or files
  // over its size limit; flag them instead of silently dropping anything.
  const tooManyReferences = references.length > limits.maxReferences;
  const oversized = [...references, ...(product ? [product] : [])].filter(
    (img) => img.file.size > limits.maxBytes,
  );
  const fileHint = `PNG, JPEG, WebP · ${toMB(limits.maxBytes)} max`;
  const canGenerate =
    !loading && !!prompt.trim() && !tooManyReferences && oversized.length === 0;

  const newImage = (file: File, i = 0): PickedImage => ({
    id: Date.now() + i,
    file,
    previewUrl: URL.createObjectURL(file),
  });

  /** Returns an error message if the file can't be sent to the selected provider. */
  function checkFile(file: File) {
    if (!REFERENCE_IMAGE_TYPES.includes(file.type))
      return `${file.name} is not a supported image. Use PNG, JPEG, or WebP.`;
    if (file.size > limits.maxBytes)
      return `${file.name} is larger than ${toMB(limits.maxBytes)}, the ${limits.label} limit.`;
    return null;
  }

  function addReferences(files: FileList | null) {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;
    const problem = picked.map(checkFile).find(Boolean);
    if (problem) return setError(problem);
    if (picked.length > slotsLeft) {
      const max = limits.maxReferences;
      return setError(
        `${limits.label} accepts up to ${max} reference image${max === 1 ? "" : "s"} (${slotsLeft} left).`,
      );
    }
    setError(null);
    setReferences((r) => [...r, ...picked.map(newImage)]);
  }

  function removeReference(id: number) {
    setReferences((r) => {
      const target = r.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return r.filter((img) => img.id !== id);
    });
  }

  function setProductFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const problem = checkFile(file);
    if (problem) return setError(problem);
    setError(null);
    if (product) URL.revokeObjectURL(product.previewUrl);
    setProduct(newImage(file));
  }

  function removeProduct() {
    if (product) URL.revokeObjectURL(product.previewUrl);
    setProduct(null);
  }

  /** Builds the multipart body the selected provider's route expects. */
  function buildForm() {
    // Images go up as regular multipart Files; the server forwards them to the provider.
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("model", model);
    if (provider === "openai") {
      form.append("quality", openaiSettings.quality);
      form.append("size", openaiSettings.size);
      form.append("outputFormat", openaiSettings.outputFormat);
      form.append("n", String(openaiSettings.n));
      if (references[0]) form.append("referenceImage", references[0].file);
    } else {
      form.append("aspectRatio", geminiSettings.aspectRatio);
      form.append("imageSize", geminiSettings.imageSize);
      form.append("n", String(geminiSettings.n));
      for (const ref of references) form.append("referenceImages", ref.file);
    }
    if (product) form.append("productImage", product.file);
    return form;
  }

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(limits.endpoint, {
        method: "POST",
        body: buildForm(),
      });
      const json = (await res
        .json()
        .catch(() => ({
          error: `Request failed (${res.status} ${res.statusText})`,
        }))) as ImageGenerationResponse | GeminiImageGenerationResponse;
      if ("error" in json) throw new Error(json.error);
      setResults((r) => [toResult(json), ...r]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Image generation test</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Temporary page for testing OpenAI and Gemini image generation. Images
        are sent in the order shown (reference images, then the product image),
        so you can refer to them as &quot;the first image&quot;, &quot;the
        second image&quot;, and so on. Leave them all empty for text-to-image.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <div>
            <label htmlFor="prompt" className={labelClass}>
              Generation Prompt
            </label>
            <textarea
              id="prompt"
              rows={10}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Use the first image as the composition reference. Create a new advertisement inspired by its composition while accurately incorporating the product..."
              className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm focus:border-brand focus:outline-none"
            />
          </div>
          <div className="flex">
            <div>
              <span className={labelClass}>
                Reference images (optional, up to {limits.maxReferences} for{" "}
                {limits.label})
              </span>
              <p className="mb-2 text-xs text-zinc-500">
                Ads whose layout and style the result should follow.
              </p>
              <DropZone onFiles={addReferences}>
                <div className="grid gap-3 sm:grid-cols-3">
                  {references.map((ref, i) => (
                    <ImagePreviewCard
                      key={ref.id}
                      label={`Reference image ${i + 1}`}
                      image={ref}
                      onRemove={() => removeReference(ref.id)}
                    />
                  ))}
                  {slotsLeft > 0 && (
                    <UploadTile
                      hint={`${fileHint} · ${slotsLeft} left`}
                      multiple={slotsLeft > 1}
                      ariaLabel="Add reference images"
                      onFiles={addReferences}
                    />
                  )}
                </div>
              </DropZone>
            </div>

            <div>
              <span className={labelClass}>Product image (optional)</span>
              <p className="mb-2 text-xs text-zinc-500">
                The product that should appear in the generated ad.
              </p>
              <DropZone onFiles={setProductFile}>
                <div className="grid gap-3 sm:grid-cols-3">
                  {product ? (
                    <ImagePreviewCard
                      label="Product image"
                      image={product}
                      onRemove={removeProduct}
                    />
                  ) : (
                    <UploadTile
                      hint={fileHint}
                      ariaLabel="Add product image"
                      onFiles={setProductFile}
                    />
                  )}
                </div>
              </DropZone>
            </div>
          </div>
          {(tooManyReferences || oversized.length > 0) && (
            <p
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
            >
              {tooManyReferences &&
                `${limits.label} accepts only ${limits.maxReferences} reference image. Remove ${references.length - limits.maxReferences} to generate. `}
              {oversized.length > 0 &&
                `${oversized.map((img) => img.file.name).join(", ")} ${oversized.length === 1 ? "is" : "are"} over the ${toMB(limits.maxBytes)} ${limits.label} limit.`}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="model" className={labelClass}>
              Model
            </label>
            <select
              id="model"
              className={selectClass}
              value={model}
              onChange={(e) => setModel(e.target.value as Model)}
            >
              <optgroup label="OpenAI">
                {IMAGE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Gemini">
                {GEMINI_IMAGE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {provider === "openai" ? (
            <>
              <div>
                <label htmlFor="quality" className={labelClass}>
                  Quality
                </label>
                <select
                  id="quality"
                  className={selectClass}
                  value={openaiSettings.quality}
                  onChange={(e) =>
                    setOpenaiSettings((s) => ({
                      ...s,
                      quality: e.target
                        .value as ImageGenerationSettings["quality"],
                    }))
                  }
                >
                  {IMAGE_QUALITIES.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="size" className={labelClass}>
                  Aspect ratio / size
                </label>
                <select
                  id="size"
                  className={selectClass}
                  value={openaiSettings.size}
                  onChange={(e) =>
                    setOpenaiSettings((s) => ({
                      ...s,
                      size: e.target.value as ImageGenerationSettings["size"],
                    }))
                  }
                >
                  {IMAGE_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="format" className={labelClass}>
                  Output format
                </label>
                <select
                  id="format"
                  className={selectClass}
                  value={openaiSettings.outputFormat}
                  onChange={(e) =>
                    setOpenaiSettings((s) => ({
                      ...s,
                      outputFormat: e.target
                        .value as ImageGenerationSettings["outputFormat"],
                    }))
                  }
                >
                  {IMAGE_OUTPUT_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="count" className={labelClass}>
                  Number of images
                </label>
                <select
                  id="count"
                  className={selectClass}
                  value={openaiSettings.n}
                  onChange={(e) =>
                    setOpenaiSettings((s) => ({
                      ...s,
                      n: Number(e.target.value) as ImageGenerationSettings["n"],
                    }))
                  }
                >
                  {IMAGE_COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="aspect" className={labelClass}>
                  Aspect ratio
                </label>
                <select
                  id="aspect"
                  className={selectClass}
                  value={geminiSettings.aspectRatio}
                  onChange={(e) =>
                    setGeminiSettings((s) => ({
                      ...s,
                      aspectRatio: e.target
                        .value as GeminiImageSettings["aspectRatio"],
                    }))
                  }
                >
                  {GEMINI_ASPECT_RATIOS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="imageSize" className={labelClass}>
                  Image size
                </label>
                <select
                  id="imageSize"
                  className={selectClass}
                  value={geminiSettings.imageSize}
                  onChange={(e) =>
                    setGeminiSettings((s) => ({
                      ...s,
                      imageSize: e.target
                        .value as GeminiImageSettings["imageSize"],
                    }))
                  }
                >
                  {GEMINI_IMAGE_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="variations" className={labelClass}>
                  Number of variations
                </label>
                <select
                  id="variations"
                  className={selectClass}
                  value={geminiSettings.n}
                  onChange={(e) =>
                    setGeminiSettings((s) => ({
                      ...s,
                      n: Number(e.target.value) as GeminiImageSettings["n"],
                    }))
                  }
                >
                  {GEMINI_VARIATION_COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                {geminiSettings.n > 1 && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Runs {geminiSettings.n} separate Gemini requests in
                    parallel, each billed as its own image.
                  </p>
                )}
              </div>
            </>
          )}

          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            aria-busy={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading && (
              <span
                className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden
              />
            )}
            {loading ? "Generating..." : "Generate Image"}
          </button>
          {loading && (
            <p className="text-xs text-zinc-500" role="status">
              Sending to {limits.label}. This can take up to a minute or two.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm whitespace-pre-wrap text-red-700"
        >
          {error}
        </div>
      )}

      {results.length > 0 && (
        <section className="mt-10 space-y-10">
          <h2 className="text-lg font-semibold">Results</h2>
          {results.map((r) => (
            <article
              key={r.id}
              className="rounded-xl border border-zinc-200 bg-white p-4"
            >
              <div
                className={`grid gap-4 ${r.images.length > 1 ? "sm:grid-cols-2" : ""}`}
              >
                {r.images.map((img, i) => (
                  <figure key={i} className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.dataUrl}
                      alt={`Generated image ${i + 1}`}
                      className="mx-auto max-h-[720px] w-auto rounded-lg bg-zinc-100 object-contain"
                    />
                    <a
                      href={img.dataUrl}
                      download={`${r.provider}-${r.id}-${i + 1}.${extension(img.mimeType)}`}
                      className="inline-block rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
                    >
                      Download
                    </a>
                    {img.text && (
                      <figcaption className="rounded-lg bg-zinc-50 p-3 text-sm whitespace-pre-wrap text-zinc-700">
                        <span className="block text-xs font-medium text-zinc-500">
                          Model text response
                        </span>
                        {img.text}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>

              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate}
                className="mt-3 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
              >
                Generate again
              </button>

              {r.failures && r.failures.length > 0 && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
                >
                  {r.failures.length} variation
                  {r.failures.length === 1 ? "" : "s"} failed:
                  <ul className="mt-1 list-disc pl-5">
                    {r.failures.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-600 sm:grid-cols-4">
                {r.settings.map(([label, value]) => (
                  <div key={label}>
                    <dt className="inline font-medium">{label}: </dt>
                    <dd className="inline break-all">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 rounded-lg bg-zinc-50 p-3 text-sm whitespace-pre-wrap text-zinc-700">
                {r.prompt}
              </p>
              {r.promptSent !== r.prompt && (
                <details className="mt-2 text-xs text-zinc-500">
                  <summary>
                    Full prompt sent to {PROVIDERS[r.provider].label}
                  </summary>
                  <p className="mt-2 rounded-lg bg-zinc-50 p-3 whitespace-pre-wrap">
                    {r.promptSent}
                  </p>
                </details>
              )}

              {r.debug && (
                <details className="mt-4 text-xs text-zinc-600">
                  <summary className="font-medium">Debug Info</summary>
                  <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-lg bg-zinc-50 p-3 font-mono">
                    {r.debug.map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt>{label}</dt>
                        <dd className="break-all">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
