"use client";

import { useState } from "react";
import { countAds, planBatches, type Batch } from "@/lib/batches";
import type { Brand } from "@/lib/brands";
import { toCreativeBreakdowns } from "@/lib/breakdown";
import { parseLandingPage } from "@/lib/landingPage";
import type { RankedLibraryAd } from "@/lib/references/library";
import {
  DIMENSIONS,
  MAX_REFERENCE_GROUPS,
  MAX_TOTAL_ADS,
  REFERENCE_ROLE_HINTS,
  REFERENCE_ROLE_LABELS,
  REFERENCE_ROLES,
  type AdBrief,
  type CopyMode,
  type Dimension,
  type GeneratedAd,
  type LandingPage,
  type ProductVisibility,
  type ReferenceRole,
} from "@/lib/types";
import { DropZone } from "./DropZone";
import { LibraryBrowser } from "./LibraryBrowser";
import { ProductPicker } from "./ProductPicker";
import { ReferenceCard, ScoreBadge, type ReferenceDraft } from "./ReferenceCard";

type Stage = "inputs" | "references" | "review" | "results";

const STAGES: { id: Stage; label: string }[] = [
  { id: "inputs", label: "Creative input" },
  { id: "references", label: "References" },
  { id: "review", label: "Review brief" },
  { id: "results", label: "Results" },
];

type ReferenceSource = "upload" | "library";

const REFERENCE_SOURCES: { id: ReferenceSource; title: string; description: string }[] = [
  {
    id: "upload",
    title: "Upload your own",
    description: "Drop in style and format references you already have.",
  },
  {
    id: "library",
    title: "Choose from library",
    description: "Pick from high-performing ads by other brands, ranked by run time and engagement.",
  },
];

function ProgressBar({ stage }: { stage: Stage }) {
  const current = STAGES.findIndex((s) => s.id === stage);
  const fill = (current / (STAGES.length - 1)) * 100;

  return (
    <div className="mb-8 px-12">
      <div className="relative">
        <div className="absolute top-3 right-0 left-0 h-0.5 -translate-y-1/2 bg-zinc-200" />
        <div
          className="absolute top-3 left-0 h-0.5 -translate-y-1/2 bg-brand transition-all duration-500"
          style={{ width: `${fill}%` }}
        />
        <ol className="relative flex justify-between">
          {STAGES.map((s, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={s.id} className="flex w-0 flex-col items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                    done || active
                      ? "border-brand bg-brand text-white"
                      : "border-zinc-300 bg-white text-zinc-400"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span
                  className={`text-xs whitespace-nowrap ${active ? "font-medium text-zinc-900" : "text-zinc-500"}`}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

const ASPECT_CLASSES: Record<Dimension, string> = {
  "9x16": "aspect-[9/16]",
  "4x5": "aspect-[4/5]",
  "1x1": "aspect-square",
};

async function fetchAsFile(url: string, name = url.split("/").pop() ?? "image") {
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type });
}

export function AdGenerator({ brand }: { brand: Brand }) {
  const [stage, setStage] = useState<Stage>("inputs");
  const [referenceSource, setReferenceSource] = useState<ReferenceSource>("upload");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [productPhotos, setProductPhotos] = useState<Record<string, File>>({});
  const [dimension, setDimension] = useState<Dimension>("4x5");
  const dimensions = [dimension];
  const [keywordsText, setKeywordsText] = useState("");
  const [copyMode, setCopyMode] = useState<CopyMode>("separate");
  const [copy, setCopy] = useState("");
  const [productVisibility, setProductVisibility] = useState<ProductVisibility>("secondary");
  const [targetAds, setTargetAds] = useState(4);
  const [landingPages, setLandingPages] = useState<LandingPage[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>(() => [crypto.randomUUID()]);
  const [references, setReferences] = useState<ReferenceDraft[]>([]);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ads, setAds] = useState<GeneratedAd[]>([]);
  const [resultBatches, setResultBatches] = useState<Batch[]>([]);
  const [provider, setProvider] = useState<string | null>(null);

  const selectedProducts = brand.products.filter((p) => productIds.includes(p.id));

  const brief: AdBrief = {
    brand: brand.name,
    products: selectedProducts.map(({ id, sku, name }) => ({ id, sku, name })),
    productVisibility,
    dimensions,
    keywords: keywordsText
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    targetAds,
    copyMode,
    copy,
    landingPages,
    referenceGroups: groupIds.map((id) => ({ id })),
    references: references.map((r) => ({
      id: r.id,
      groupId: r.groupId,
      fileName: r.file.name,
      source: r.source,
      role: r.role,
      prompt: r.prompt,
      metrics: r.metrics,
    })),
  };
  const batches = planBatches(brief);
  const totalAds = countAds(brief);
  const refName = (id: string | null) => references.find((r) => r.id === id)?.file.name ?? "";
  const breakdowns = toCreativeBreakdowns(brief, brand.id);
  const breakdownJson = JSON.stringify(breakdowns.length === 1 ? breakdowns[0] : breakdowns, null, 2);

  const emptyGroups = groupIds
    .map((id, i) => (references.some((r) => r.groupId === id) ? null : i + 1))
    .filter((n) => n !== null);
  const inputsMissing = [brief.products.length === 0 && "a product"].filter(Boolean);
  const referencesMissing = [
    emptyGroups.length > 0 &&
      `a style or format reference in group${emptyGroups.length > 1 ? "s" : ""} ${emptyGroups.join(", ")}`,
  ].filter(Boolean);
  const canReview = inputsMissing.length === 0 && referencesMissing.length === 0 && totalAds <= MAX_TOTAL_ADS;

  function addGroup() {
    setGroupIds((prev) => [...prev, crypto.randomUUID()]);
  }

  function removeGroup(groupId: string) {
    references.filter((r) => r.groupId === groupId).forEach((r) => URL.revokeObjectURL(r.previewUrl));
    setReferences((prev) => prev.filter((r) => r.groupId !== groupId));
    setGroupIds((prev) => prev.filter((id) => id !== groupId));
  }

  function addReferences(groupId: string, role: ReferenceRole, files: FileList | null) {
    if (!files) return;
    const drafts = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map<ReferenceDraft>((file) => ({
        id: crypto.randomUUID(),
        groupId,
        file,
        previewUrl: URL.createObjectURL(file),
        role,
        prompt: "",
        metrics: {},
        source: "upload",
      }));
    setReferences((prev) => [...prev, ...drafts]);
  }

  async function addLibraryAds(ads: RankedLibraryAd[], groupIndex: number, role: ReferenceRole) {
    const groupId = groupIds[groupIndex];
    const fresh = ads.filter(
      (ad) => !references.some((r) => r.libraryAdId === ad.id && r.groupId === groupId && r.role === role),
    );
    const drafts = await Promise.all(
      fresh.map(async (ad): Promise<ReferenceDraft | null> => {
        const ext = ad.imageUrl.startsWith("data:image/svg") ? "svg" : (ad.imageUrl.match(/\.(jpe?g|png|webp)(?:\?|$)/i)?.[1] ?? "jpg");
        const file = await fetchAsFile(ad.imageUrl, `${ad.brand}-${ad.id}.${ext}`.replace(/\s+/g, "_")).catch(() => null);
        if (!file) return null;
        return {
          id: crypto.randomUUID(),
          groupId,
          file,
          previewUrl: URL.createObjectURL(file),
          role,
          prompt: "",
          metrics: ad.metrics,
          source: "sourced",
          libraryAdId: ad.id,
          sourcedFrom: [ad.brand, ad.headline || ad.category].filter(Boolean).join(" · "),
        };
      }),
    );
    setReferences((prev) => [...prev, ...drafts.filter((d) => d !== null)]);
  }

  function libraryUsage(adId: string) {
    return references
      .filter((r) => r.libraryAdId === adId)
      .map((r) => ({ groupIndex: groupIds.indexOf(r.groupId), role: r.role }));
  }

  function removeLibraryAd(adId: string, groupIndex: number, role: ReferenceRole) {
    const target = references.find(
      (r) => r.libraryAdId === adId && r.groupId === groupIds[groupIndex] && r.role === role,
    );
    if (target) removeReference(target.id);
  }

  function removeReference(id: string) {
    const target = references.find((r) => r.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    setReferences((prev) => prev.filter((r) => r.id !== id));
  }

  function usageFor(r: ReferenceDraft) {
    const count = (batches.find((b) => b.id === r.groupId)?.jobs ?? [])
      .filter((j) => (r.role === "style" ? j.style : j.format)?.id === r.id)
      .reduce((sum, j) => sum + j.count, 0);
    if (count === 0) return "Not used (target too low)";
    const otherRole = r.role === "style" ? "format" : "style";
    const groupHasOther = references.some((x) => x.groupId === r.groupId && x.role === otherRole);
    return `Used in ${count} ads${groupHasOther ? "" : r.role === "style" ? " · new layout" : " · new style"}`;
  }

  function batchLabel(b: Batch) {
    return `Group ${b.index + 1}`;
  }

  async function addLandingPages(files: FileList | null) {
    if (!files) return;
    const parsed = await Promise.all(
      Array.from(files).map(async (file) => parseLandingPage(file.name, await file.text())),
    );
    setLandingPages((prev) => [...prev, ...parsed]);
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("brief", JSON.stringify(brief));
      if (productVisibility === "secondary") {
        for (const p of selectedProducts) {
          const photo = productPhotos[p.id] ?? (p.image ? await fetchAsFile(p.image) : null);
          if (photo) form.append(`product:${p.id}`, photo);
        }
      }
      for (const r of references) form.append(`reference:${r.id}`, r.file);

      const res = await fetch("/api/generate", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");

      setAds(json.ads);
      setResultBatches(batches);
      setProvider(json.provider);
      setStage("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function downloadAll() {
    for (const ad of ads) {
      const a = document.createElement("a");
      a.href = ad.imageUrl;
      a.download = fileNameFor(ad);
      a.click();
    }
  }

  function fileNameFor(ad: GeneratedAd) {
    const base = refName(ad.batchId).replace(/\.[^.]+$/, "") || "ad";
    const ext = ad.imageUrl.startsWith("data:image/svg") ? "svg" : "png";
    return `${brand.id}-${base}-${ad.dimension}-${ad.variation}.${ext}`.replace(/\s+/g, "_");
  }

  return (
    <div>
      <ProgressBar stage={stage} />

      {stage === "inputs" && (
        <div className="flex flex-col gap-8">
          <section className="card">
            <h2 className="section-title">Creative input</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="field">
                <span>Brand *</span>
                <p className="py-2 text-sm font-normal text-zinc-900">
                  {brand.name} <span className="text-zinc-400">(switch with the tabs above)</span>
                </p>
              </div>

              <div className="field">
                <span>Dimension format *</span>
                <div role="radiogroup" className="flex gap-2">
                  {DIMENSIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={d === dimension}
                      onClick={() => setDimension(d)}
                      className={`rounded-lg border px-3 py-1.5 text-sm ${
                        d === dimension
                          ? "border-brand bg-brand text-white"
                          : "border-zinc-300 bg-white text-zinc-700"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <ProductPicker
                  products={brand.products}
                  selectedIds={productIds}
                  onToggle={(id) =>
                    setProductIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                  }
                  visibility={productVisibility}
                  onVisibilityChange={setProductVisibility}
                  photos={productPhotos}
                  onPhotoChange={(id, file) =>
                    setProductPhotos((prev) => {
                      const next = { ...prev };
                      if (file) next[id] = file;
                      else delete next[id];
                      return next;
                    })
                  }
                />
              </div>

              <label className="field">
                <span>Keywords (comma separated)</span>
                <input
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder="fresh, summer, clean ingredients"
                />
              </label>

              <label className="field">
                <span>Target number of ads</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_TOTAL_ADS}
                  value={targetAds}
                  onChange={(e) =>
                    setTargetAds(Math.max(1, Math.min(MAX_TOTAL_ADS, Math.floor(Number(e.target.value)) || 1)))
                  }
                />
                <span className="font-normal text-zinc-400">
                  Split evenly across your reference groups.
                </span>
              </label>

              <label className="field">
                <span>Copy</span>
                <select value={copyMode} onChange={(e) => setCopyMode(e.target.value as CopyMode)}>
                  <option value="separate">Copy separate (no text in image)</option>
                  <option value="in-image">Render copy in image</option>
                </select>
              </label>
              {copyMode === "in-image" ? (
                <label className="field">
                  <span>Ad copy</span>
                  <textarea rows={2} value={copy} onChange={(e) => setCopy(e.target.value)} />
                </label>
              ) : (
                <div />
              )}

              <div className="field col-span-2">
                <span>Landing page HTML files (optional)</span>
                <div className="flex flex-wrap items-center gap-2">
                  {landingPages.map((lp, i) => (
                    <span
                      key={`${lp.fileName}-${i}`}
                      title={lp.headings.join("\n")}
                      className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-normal text-zinc-800"
                    >
                      <span className="max-w-64 truncate">{lp.title}</span>
                      <button
                        type="button"
                        onClick={() => setLandingPages((prev) => prev.filter((_, j) => j !== i))}
                        className="text-zinc-400 hover:text-rose-600"
                        aria-label={`Remove ${lp.fileName}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <label className="cursor-pointer rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-sm font-normal text-zinc-600 hover:border-zinc-500">
                    Upload .html
                    <input
                      type="file"
                      accept=".html,.htm,text/html"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void addLandingPages(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <details className="mt-6 rounded-lg border border-zinc-200" open>
              <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-zinc-600">
                Creative breakdown (Step 1 test)
              </summary>
              <div className="flex gap-2 px-4 pt-1">
                <button
                  type="button"
                  className="btn-secondary px-3 py-1 text-xs"
                  onClick={() => console.log(`[${brand.name}] creative breakdown`, breakdowns)}
                >
                  Log to console
                </button>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1 text-xs"
                  onClick={() => void navigator.clipboard.writeText(breakdownJson)}
                >
                  Copy JSON
                </button>
              </div>
              <pre className="m-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">{breakdownJson}</pre>
            </details>
          </section>

          <footer className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              {inputsMissing.length > 0 ? `Still needed: ${inputsMissing.join(", ")}` : "Creative input is complete."}
            </p>
            <button
              type="button"
              disabled={inputsMissing.length > 0}
              onClick={() => setStage("references")}
              className="btn-primary"
            >
              Next: references
            </button>
          </footer>
        </div>
      )}

      {stage === "references" && (
        <div className="flex flex-col gap-8">
          <section className="card">
            <h2 className="section-title">Reference source</h2>
            <div role="radiogroup" className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {REFERENCE_SOURCES.map((s) => {
                const selected = referenceSource === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setReferenceSource(s.id)}
                    className={`flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition-colors ${
                      selected ? "border-brand bg-brand/5" : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <span className="text-sm font-semibold">{s.title}</span>
                    <span className="text-sm text-zinc-500">{s.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {referenceSource === "library" && (
            <LibraryBrowser
              suggestedQuery={brief.keywords.join(" ")}
              groupCount={groupIds.length}
              addedTo={libraryUsage}
              onAdd={addLibraryAds}
              onRemove={removeLibraryAd}
            />
          )}

          <section className="card">
            <h2 className="section-title mb-1">References *</h2>
            <p className="mb-5 text-sm text-zinc-500">
              Each group generates its own batch, and the target is split evenly across groups. A group needs at
              least one style or format reference.
            </p>

            <div className="flex flex-col gap-4">
              {groupIds.map((groupId, groupIndex) => {
                const batch = batches.find((b) => b.id === groupId);
                return (
                  <div key={groupId} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">
                        Group {groupIndex + 1}{" "}
                        <span className="font-normal text-zinc-400">
                          {batch ? `· ${batch.count} ads` : "· needs a reference"}
                        </span>
                      </h3>
                      {groupIds.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeGroup(groupId)}
                          className="text-xs text-zinc-500 hover:text-rose-600"
                        >
                          Remove group
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
                      {REFERENCE_ROLES.map((role) => {
                        const set = references.filter((r) => r.groupId === groupId && r.role === role);
                        return (
                          <DropZone
                            key={role}
                            className="flex flex-col gap-3"
                            onFiles={(files) => addReferences(groupId, role, files)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-sm font-medium">
                                  {REFERENCE_ROLE_LABELS[role]}s{" "}
                                  <span className="font-normal text-zinc-400">({set.length})</span>
                                </h4>
                                <p className="text-xs text-zinc-500">{REFERENCE_ROLE_HINTS[role]}</p>
                              </div>
                              <label className="shrink-0 cursor-pointer rounded-lg bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand/85">
                                Upload
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={(e) => {
                                    addReferences(groupId, role, e.target.files);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            </div>

                            {set.length === 0 ? (
                              <label className="cursor-pointer rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 hover:border-zinc-500">
                                Drag images here or click to upload
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={(e) => {
                                    addReferences(groupId, role, e.target.files);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            ) : (
                              set.map((r) => (
                                <ReferenceCard
                                  key={r.id}
                                  reference={r}
                                  usage={usageFor(r)}
                                  onChange={(next) =>
                                    setReferences((prev) => prev.map((x) => (x.id === r.id ? next : x)))
                                  }
                                  onRemove={() => removeReference(r.id)}
                                />
                              ))
                            )}
                          </DropZone>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {groupIds.length < MAX_REFERENCE_GROUPS && (
                <button
                  type="button"
                  onClick={addGroup}
                  aria-label="Add reference group"
                  className="flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 text-sm text-zinc-500 hover:border-zinc-500 hover:text-zinc-800"
                >
                  <span className="text-xl leading-none">+</span> Add group
                </button>
              )}
            </div>
          </section>

          <footer className="flex items-center justify-between gap-4">
            <button type="button" onClick={() => setStage("inputs")} className="btn-secondary">
              Back
            </button>
            <p className="flex-1 text-right text-sm text-zinc-500">
              {referencesMissing.length > 0
                ? `Still needed: ${referencesMissing.join(", ")}`
                : `${totalAds} ${dimension} ads across ${batches.length} group${batches.length === 1 ? "" : "s"}`}
            </p>
            <button type="button" disabled={!canReview} onClick={() => setStage("review")} className="btn-primary">
              Review brief
            </button>
          </footer>
        </div>
      )}

      {stage === "review" && (
        <div className="flex flex-col gap-6">
          <section className="card">
            <h2 className="section-title">Creative brief</h2>
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <dt className="text-zinc-500">Brand</dt>
              <dd>{brief.brand}</dd>
              <dt className="text-zinc-500">Products</dt>
              <dd>{brief.products.map((p) => p.name).join(", ")}</dd>
              <dt className="text-zinc-500">Product in the ad</dt>
              <dd>
                {productVisibility === "secondary"
                  ? `Secondary · ${
                      selectedProducts.filter((p) => productPhotos[p.id] || p.image).length
                    }/${selectedProducts.length} with photos`
                  : "No product"}
              </dd>
              <dt className="text-zinc-500">Dimensions</dt>
              <dd>{brief.dimensions.join(", ")}</dd>
              <dt className="text-zinc-500">Keywords</dt>
              <dd>{brief.keywords.join(", ") || "None"}</dd>
              <dt className="text-zinc-500">Copy</dt>
              <dd>{copyMode === "separate" ? "Separate" : `In image: "${copy}"`}</dd>
              <dt className="text-zinc-500">Landing pages</dt>
              <dd>{landingPages.map((lp) => lp.title).join(", ") || "None"}</dd>
              <dt className="text-zinc-500">Target ads</dt>
              <dd>
                {totalAds} ads across {batches.length} group{batches.length === 1 ? "" : "s"}
              </dd>
            </dl>

            <div className="mt-6 flex flex-col gap-3">
              {batches.map((b) => (
                <div key={b.id} className="rounded-lg bg-zinc-50 p-3 text-sm">
                  <p className="mb-2 font-medium">
                    {batchLabel(b)} <span className="font-normal text-zinc-500">· {b.count} ads</span>
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {b.jobs.map((j) => (
                      <div key={`${j.style?.id}-${j.format?.id}`} className="flex items-center gap-2">
                        {[j.style, j.format].map(
                          (ref) =>
                            ref && (
                              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                              <img
                                key={ref.id}
                                src={references.find((d) => d.id === ref.id)?.previewUrl}
                                alt=""
                                className="h-12 w-9 rounded object-cover"
                              />
                            ),
                        )}
                        <span className="min-w-0 flex-1 truncate text-zinc-600">
                          {j.style ? `style ${j.style.fileName}` : "new style"} ×{" "}
                          {j.format ? `format ${j.format.fileName}` : "new layout"}
                        </span>
                        <span className="text-zinc-500">{j.count} ads</span>
                        {[j.style, j.format].map((ref) => ref && <ScoreBadge key={ref.id} metrics={ref.metrics} />)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <details className="mt-6">
              <summary className="cursor-pointer text-xs font-medium text-zinc-600">Brief JSON</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
                {JSON.stringify(brief, null, 2)}
              </pre>
            </details>
          </section>

          {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

          <footer className="flex justify-between">
            <button
              type="button"
              onClick={() => setStage("references")}
              className="btn-secondary"
              disabled={generating}
            >
              Back to references
            </button>
            <button type="button" onClick={generate} className="btn-primary" disabled={generating}>
              {generating ? "Generating…" : `Confirm & generate ${totalAds} ads`}
            </button>
          </footer>
        </div>
      )}

      {stage === "results" && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              {ads.length} ads generated with <code>{provider}</code>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStage("inputs")} className="btn-secondary">
                Edit inputs
              </button>
              <button type="button" onClick={downloadAll} className="btn-primary">
                Download all
              </button>
            </div>
          </div>

          {resultBatches.map((b) => {
            const refAds = ads.filter((a) => a.batchId === b.id);
            if (refAds.length === 0) return null;
            return (
              <section key={b.id} className="card">
                <h2 className="section-title">{batchLabel(b)}</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {refAds.map((ad) => (
                    <figure key={ad.id} className="flex flex-col gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
                      <img
                        src={ad.imageUrl}
                        alt={`${ad.dimension} variation ${ad.variation}`}
                        title={ad.prompt}
                        className={`${ASPECT_CLASSES[ad.dimension]} w-full rounded-lg bg-zinc-100 object-cover`}
                      />
                      <figcaption className="flex justify-between text-xs text-zinc-500">
                        <span className="truncate" title={refName(ad.formatRefId)}>
                          #{ad.variation}
                          {ad.formatRefId && ` · ${refName(ad.formatRefId)}`}
                        </span>
                        <a href={ad.imageUrl} download={fileNameFor(ad)} className="hover:text-zinc-900">
                          Download
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
