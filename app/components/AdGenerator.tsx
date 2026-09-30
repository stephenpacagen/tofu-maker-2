"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { countAds, planBatches, splitEvenly, type Batch } from "@/lib/batches";
import type { Brand } from "@/lib/brands";
import { toCreativeBreakdowns } from "@/lib/breakdown";
import {
  DEFAULT_GENERATION_OPTIONS,
  GEMINI_IMAGE_SIZES,
  GENERATION_CONCURRENCY,
  GENERATION_MODELS,
  IMAGE_QUALITIES,
  MAX_IMAGES_PER_REQUEST,
  providerOf,
  type GenerateChunk,
  type GenerateChunkResponse,
  type GenerationOptions,
} from "@/lib/generation/models";
import { parseLandingPage } from "@/lib/landingPage";
import type { RankedLibraryAd } from "@/lib/references/library";
import {
  DIMENSIONS,
  MAX_REFERENCE_GROUPS,
  MAX_TOTAL_ADS,
  MAX_VARIATIONS_PER_REFERENCE,
  MIN_VARIATIONS_PER_REFERENCE,
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
import {
  ReferenceCard,
  ScoreBadge,
  type ReferenceDraft,
} from "./ReferenceCard";

type Stage = "inputs" | "references" | "review" | "results";

const STAGES: { id: Stage; label: string }[] = [
  { id: "inputs", label: "Creative input" },
  { id: "references", label: "References" },
  { id: "review", label: "Review brief" },
  { id: "results", label: "Results" },
];

type ReferenceSource = "upload" | "library";

const REFERENCE_SOURCES: {
  id: ReferenceSource;
  title: string;
  description: string;
}[] = [
  {
    id: "upload",
    title: "Upload your own",
    description: "Drop in style and format references you already have.",
  },
  {
    id: "library",
    title: "Choose from library",
    description:
      "Pick from high-performing ads by other brands, ranked by run time and engagement.",
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

function ResultFigure({
  ad,
  selected,
  downloadName,
  onOpen,
  onToggle,
}: {
  ad: GeneratedAd;
  selected: boolean;
  downloadName: string;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <figure className="flex flex-col gap-1">
      <p className="text-left text-xs font-semibold text-zinc-800">#{ad.variation}</p>
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`View variation ${ad.variation} full screen`}
          aria-pressed={selected}
          className={`block w-full cursor-zoom-in rounded-lg text-left ring-2 ring-offset-2 ${
            selected ? "ring-brand" : "ring-transparent"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          <img
            src={ad.imageUrl}
            alt={`${ad.dimension} variation ${ad.variation}`}
            title={ad.prompt}
            className={`${ASPECT_CLASSES[ad.dimension]} w-full rounded-lg bg-zinc-100 object-cover`}
          />
        </button>
        <label className="absolute top-2 left-2 z-10 flex size-7 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select variation ${ad.variation}`}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-lg border-2 border-white/80 bg-white/95 text-white shadow-md transition peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 peer-hover:scale-105"
          >
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3.5 8.5 6.5 11.5 12.5 4.5" className={selected ? "" : "opacity-0"} />
            </svg>
          </span>
        </label>
      </div>
      <a
        href={ad.imageUrl}
        download={downloadName}
        className="mx-auto mt-1 inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs font-medium text-zinc-800 shadow-sm transition hover:border-brand hover:text-brand"
      >
        Download
      </a>
    </figure>
  );
}

/** A GenerateChunk plus its progress in the results view. */
type Chunk = GenerateChunk & {
  key: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
  /** Images that failed inside an otherwise successful chunk. */
  failures?: string[];
};

/** Everything a run needs, captured on confirm so editing inputs mid-run can't change it. */
type RunContext = {
  id: string;
  brief: AdBrief;
  options: GenerationOptions;
  referenceFiles: Map<string, File>;
  productFiles: Map<string, File>;
};

/**
 * Splits the reviewed plan into /api/generate calls for the first selected dimension
 * only. Other sizes are a follow-up model call that resizes each of those images.
 */
function planChunks(batches: Batch[], dimensions: Dimension[]): Chunk[] {
  const source = dimensions[0];
  if (!source) return [];
  const chunks: Chunk[] = [];
  for (const batch of batches) {
    let variation = 1;
    for (const job of batch.jobs) {
      const parts = splitEvenly(
        job.count,
        Math.ceil(job.count / MAX_IMAGES_PER_REQUEST),
      );
      for (const count of parts) {
        chunks.push({
          key: `${batch.id}-${job.style?.id ?? "none"}-${job.format?.id ?? "none"}-${source}-${variation}`,
          groupId: batch.id,
          styleRefId: job.style?.id ?? null,
          formatRefId: job.format?.id ?? null,
          dimension: source,
          count,
          variationStart: variation,
          status: "pending",
        });
        variation += count;
      }
    }
  }
  return chunks;
}

function resizedAdId(chunk: Chunk, variation: number, dimension: Dimension) {
  return `${chunk.groupId}-${chunk.styleRefId ?? "none"}-${chunk.formatRefId ?? "none"}-${dimension}-${variation}`;
}

async function dataUrlToFile(dataUrl: string, name: string) {
  const blob = await fetch(dataUrl).then((res) => res.blob());
  const type = blob.type.startsWith("image/") ? blob.type : "image/png";
  return new File([blob], name, { type });
}

/** Runs tasks with at most `limit` in flight. */
async function runPool(tasks: (() => Promise<void>)[], limit: number) {
  const queue = [...tasks];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await queue.shift()!();
    }),
  );
}

/** Full-screen viewer for finished generations. Scroll, swipe, or use the arrows to move between them. */
function GenerationLightbox({
  ads,
  startId,
  groupNames,
  isSelected,
  onToggleSelected,
  onClose,
}: {
  ads: GeneratedAd[];
  startId: string;
  groupNames: Record<string, string>;
  isSelected: (ad: GeneratedAd) => boolean;
  onToggleSelected: (ad: GeneratedAd) => void;
  onClose: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const startIndex = Math.max(
    0,
    ads.findIndex((ad) => ad.id === startId),
  );
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      el.scrollLeft = startIndex * el.clientWidth;
    });
    return () => cancelAnimationFrame(frame);
  }, [startIndex]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    function step(delta: number) {
      const width = el.clientWidth;
      if (!width) return;
      const current = Math.round(el.scrollLeft / width);
      const next = Math.min(ads.length - 1, Math.max(0, current + delta));
      el.scrollTo({ left: next * width, behavior: "smooth" });
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }

    let wheelLock = false;
    function onWheel(e: WheelEvent) {
      if (ads.length < 2) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (wheelLock) return;
      wheelLock = true;
      window.setTimeout(() => {
        wheelLock = false;
      }, 350);
      step(e.deltaY > 0 ? 1 : -1);
    }

    document.addEventListener("keydown", onKey);
    el.addEventListener("wheel", onWheel, { passive: false });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      el.removeEventListener("wheel", onWheel);
      document.body.style.overflow = previousOverflow;
    };
  }, [ads.length, onClose]);

  if (typeof document === "undefined") return null;

  function stepFromButton(delta: number) {
    const el = scroller.current;
    const width = el?.clientWidth ?? 0;
    if (!el || !width) return;
    const current = Math.round(el.scrollLeft / width);
    const next = Math.min(ads.length - 1, Math.max(0, current + delta));
    el.scrollTo({ left: next * width, behavior: "smooth" });
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Generated ads"
      className="fixed inset-0 z-50 bg-black/90"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
      >
        Close
      </button>
      {ads.length > 1 && (
        <button
          type="button"
          aria-label="Previous image"
          disabled={index === 0}
          onClick={() => stepFromButton(-1)}
          className="absolute top-1/2 left-3 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 disabled:opacity-30 sm:left-6"
        >
          ‹
        </button>
      )}
      <div
        ref={scroller}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        onScroll={(e) => {
          const width = e.currentTarget.clientWidth;
          if (!width) return;
          setIndex(Math.round(e.currentTarget.scrollLeft / width));
        }}
      >
        {ads.map((ad, i) => {
          const selected = isSelected(ad);
          return (
            <div
              key={ad.id}
              className="flex h-full shrink-0 grow-0 basis-full snap-center flex-col items-center justify-center px-16 py-8"
              onClick={onClose}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
              <img
                src={ad.imageUrl}
                alt={`${ad.dimension} variation ${ad.variation}, image ${i + 1} of ${ads.length}`}
                className="max-h-[calc(100dvh-11rem)] max-w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <div
                className="mt-4 flex flex-col items-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-medium text-white">
                  {groupNames[ad.batchId] ?? "Group"} · #{ad.variation} · {ad.dimension}
                  {ads.length > 1 && (
                    <span className="text-white/70">
                      {" "}
                      · {i + 1} / {ads.length}
                    </span>
                  )}
                </p>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-5 py-3 text-base font-semibold shadow-lg ${
                    selected
                      ? "bg-white text-zinc-900"
                      : "bg-zinc-800 text-white ring-2 ring-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelected(ad)}
                    className="size-5 accent-brand"
                  />
                  {selected ? "Selected for download" : "Not selected"}
                </label>
              </div>
            </div>
          );
        })}
      </div>
      {ads.length > 1 && (
        <button
          type="button"
          aria-label="Next image"
          disabled={index === ads.length - 1}
          onClick={() => stepFromButton(1)}
          className="absolute top-1/2 right-3 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 disabled:opacity-30 sm:right-6"
        >
          ›
        </button>
      )}
    </div>,
    document.body,
  );
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const extensionOf = (dataUrl: string) =>
  MIME_EXTENSIONS[dataUrl.match(/^data:([^;,]+)/)?.[1] ?? ""] ?? "png";

async function fetchAsFile(
  url: string,
  name = url.split("/").pop() ?? "image",
) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type });
}

export function AdGenerator({ brand }: { brand: Brand }) {
  const [stage, setStage] = useState<Stage>("inputs");
  const [referenceSource, setReferenceSource] =
    useState<ReferenceSource>("upload");
  const [productId, setProductId] = useState<string | null>(null);
  const [productPhotos, setProductPhotos] = useState<Record<string, File>>({});
  const [dimensions, setDimensions] = useState<Dimension[]>(["4x5"]);
  const [keywordsText, setKeywordsText] = useState("");
  const [copyMode, setCopyMode] = useState<CopyMode>("separate");
  const [copy, setCopy] = useState("");
  const [productVisibility, setProductVisibility] =
    useState<ProductVisibility>("secondary");
  const [targetAds, setTargetAds] = useState(4);
  const [landingPages, setLandingPages] = useState<LandingPage[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>(() => [
    { id: crypto.randomUUID(), name: "Group 1" },
  ]);
  const groupIds = groups.map((g) => g.id);
  const [references, setReferences] = useState<ReferenceDraft[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [ads, setAds] = useState<GeneratedAd[]>([]);
  const [openAdId, setOpenAdId] = useState<string | null>(null);
  // Image ids the user has turned off. Anything not listed stays selected, including images that finish later.
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());
  const [resultBatches, setResultBatches] = useState<Batch[]>([]);
  const [options, setOptions] = useState<GenerationOptions>(
    DEFAULT_GENERATION_OPTIONS,
  );
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [preparing, setPreparing] = useState(false);
  const run = useRef<RunContext | null>(null);
  const runOptions = run.current?.options ?? options;
  const generating =
    preparing ||
    chunks.some((c) => c.status === "pending" || c.status === "running");

  const selectedProducts = brand.products.filter((p) => p.id === productId);

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
    referenceGroups: groups.map(({ id, name }) => ({ id, name })),
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
  const refName = (id: string | null) =>
    references.find((r) => r.id === id)?.file.name ?? "";
  const breakdowns = toCreativeBreakdowns(brief, brand.id);
  const breakdownJson = JSON.stringify(
    breakdowns.length === 1 ? breakdowns[0] : breakdowns,
    null,
    2,
  );

  const emptyGroups = groups
    .map((g, i) =>
      references.some((r) => r.groupId === g.id) ? null : g.name.trim() || `Group ${i + 1}`,
    )
    .filter((n) => n !== null);
  const inputsMissing = [
    brief.products.length === 0 && "a product",
    dimensions.length === 0 && "a dimension",
  ].filter(Boolean);
  const referencesMissing = [
    emptyGroups.length > 0 &&
      `a style or format reference in group${emptyGroups.length > 1 ? "s" : ""} ${emptyGroups.join(", ")}`,
  ].filter(Boolean);
  const canReview =
    inputsMissing.length === 0 &&
    referencesMissing.length === 0 &&
    totalAds <= MAX_TOTAL_ADS;

  function addGroup() {
    setGroups((prev) => [...prev, { id: crypto.randomUUID(), name: `Group ${prev.length + 1}` }]);
  }

  function renameGroup(groupId: string, name: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
  }

  function removeGroup(groupId: string) {
    references
      .filter((r) => r.groupId === groupId)
      .forEach((r) => URL.revokeObjectURL(r.previewUrl));
    setReferences((prev) => prev.filter((r) => r.groupId !== groupId));
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  function addReferences(
    groupId: string,
    role: ReferenceRole,
    files: FileList | null,
  ) {
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

  async function addLibraryAds(
    ads: RankedLibraryAd[],
    groupIndex: number,
    role: ReferenceRole,
  ) {
    const groupId = groupIds[groupIndex];
    const fresh = ads.filter(
      (ad) =>
        !references.some(
          (r) =>
            r.libraryAdId === ad.id && r.groupId === groupId && r.role === role,
        ),
    );
    const drafts = await Promise.all(
      fresh.map(async (ad): Promise<ReferenceDraft | null> => {
        const ext = ad.imageUrl.startsWith("data:image/svg")
          ? "svg"
          : (ad.imageUrl.match(/\.(jpe?g|png|webp)(?:\?|$)/i)?.[1] ?? "jpg");
        const file = await fetchAsFile(
          ad.imageUrl,
          `${ad.brand}-${ad.id}.${ext}`.replace(/\s+/g, "_"),
        ).catch(() => null);
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
          sourcedFrom: [ad.brand, ad.headline || ad.category]
            .filter(Boolean)
            .join(" · "),
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

  function removeLibraryAd(
    adId: string,
    groupIndex: number,
    role: ReferenceRole,
  ) {
    const target = references.find(
      (r) =>
        r.libraryAdId === adId &&
        r.groupId === groupIds[groupIndex] &&
        r.role === role,
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
    const groupHasOther = references.some(
      (x) => x.groupId === r.groupId && x.role === otherRole,
    );
    return `Used in ${count} ads${groupHasOther ? "" : r.role === "style" ? " · new layout" : " · new style"}`;
  }

  function batchLabel(b: Batch) {
    return b.name.trim() || `Group ${b.index + 1}`;
  }

  async function addLandingPages(files: FileList | null) {
    if (!files) return;
    const parsed = await Promise.all(
      Array.from(files).map(async (file) =>
        parseLandingPage(file.name, await file.text()),
      ),
    );
    setLandingPages((prev) => [...prev, ...parsed]);
  }

  const updateChunk = (runId: string, key: string, patch: Partial<Chunk>) => {
    if (run.current?.id !== runId) return; // a newer run replaced this one
    setChunks((prev) =>
      prev.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    );
  };

  /** Generates one chunk: sends the brief JSON, the chunk, and only the images it uses. */
  async function runChunk(ctx: RunContext, chunk: Chunk) {
    updateChunk(ctx.id, chunk.key, {
      status: "running",
      error: undefined,
      failures: undefined,
    });
    try {
      const request: GenerateChunk = {
        groupId: chunk.groupId,
        styleRefId: chunk.styleRefId,
        formatRefId: chunk.formatRefId,
        dimension: chunk.dimension,
        count: chunk.count,
        variationStart: chunk.variationStart,
      };
      const form = new FormData();
      form.append("brief", JSON.stringify(ctx.brief));
      form.append("chunk", JSON.stringify(request));
      form.append("options", JSON.stringify(ctx.options));
      for (const refId of [chunk.styleRefId, chunk.formatRefId]) {
        const file = refId ? ctx.referenceFiles.get(refId) : undefined;
        if (refId && file) form.append(`reference:${refId}`, file);
      }
      for (const [productId, file] of ctx.productFiles)
        form.append(`product:${productId}`, file);

      const res = await fetch("/api/generate", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({
        error: `Request failed (${res.status} ${res.statusText})`,
      }))) as GenerateChunkResponse;
      if ("error" in json) throw new Error(json.error);
      if (run.current?.id !== ctx.id) return;

      const extras = ctx.brief.dimensions.filter((d) => d !== chunk.dimension);
      const replacedIds = new Set(
        json.ads.flatMap((ad) => [ad.id, ...extras.map((dimension) => resizedAdId(chunk, ad.variation, dimension))]),
      );
      setAds((prev) => [...prev.filter((a) => !replacedIds.has(a.id)), ...json.ads]);

      const resizeFailures: string[] = [];
      await runPool(
        json.ads.flatMap((ad) =>
          extras.map((dimension) => async () => {
            try {
              const file = await dataUrlToFile(ad.imageUrl, `${ad.dimension}-${ad.variation}.png`);
              const resizeForm = new FormData();
              resizeForm.append("brief", JSON.stringify(ctx.brief));
              resizeForm.append("options", JSON.stringify(ctx.options));
              resizeForm.append("dimension", dimension);
              resizeForm.append("image", file);
              const resizeRes = await fetch("/api/resize-ad", { method: "POST", body: resizeForm });
              const resized = (await resizeRes.json().catch(() => ({
                error: `Resize failed (${resizeRes.status} ${resizeRes.statusText})`,
              }))) as { imageUrl: string; prompt: string; failures: string[] } | { error: string };
              if ("error" in resized) throw new Error(resized.error);
              if (run.current?.id !== ctx.id) return;
              const next: GeneratedAd = {
                ...ad,
                id: resizedAdId(chunk, ad.variation, dimension),
                dimension,
                imageUrl: resized.imageUrl,
                prompt: resized.prompt,
              };
              setAds((prev) => [...prev.filter((a) => a.id !== next.id), next]);
              if (resized.failures.length > 0) resizeFailures.push(...resized.failures);
            } catch (err) {
              resizeFailures.push(
                err instanceof Error
                  ? `Variation ${ad.variation} → ${dimension}: ${err.message}`
                  : `Could not resize variation ${ad.variation} to ${dimension}`,
              );
            }
          }),
        ),
        2,
      );
      if (run.current?.id !== ctx.id) return;

      updateChunk(ctx.id, chunk.key, {
        status: "done",
        failures: [...json.failures, ...resizeFailures],
      });
    } catch (e) {
      updateChunk(ctx.id, chunk.key, {
        status: "error",
        error: e instanceof Error ? e.message : "Generation failed",
      });
    }
  }

  /**
   * Confirm & generate: snapshots the reviewed brief (the "Brief JSON" above), splits it
   * into per-group / per-pairing chunks for the first selected size, and runs them in parallel.
   * Each finished image is then sent back to the model to be resized into the other sizes.
   * Results appear group by group as each chunk finishes.
   */
  async function generate() {
    setPreparing(true);
    setError(null);
    try {
      const productFiles = new Map<string, File>();
      if (productVisibility === "secondary") {
        for (const p of selectedProducts) {
          const photo =
            productPhotos[p.id] ??
            (p.image ? await fetchAsFile(p.image) : null);
          if (photo) productFiles.set(p.id, photo);
        }
      }
      const ctx: RunContext = {
        id: crypto.randomUUID(),
        brief,
        options,
        referenceFiles: new Map(references.map((r) => [r.id, r.file])),
        productFiles,
      };
      const planned = planChunks(batches, brief.dimensions);

      run.current = ctx;
      setAds([]);
      setDeselectedIds(new Set());
      setResultBatches(batches);
      setChunks(planned);
      setStage("results");
      setPreparing(false);

      await runPool(
        planned.map((c) => () => runChunk(ctx, c)),
        GENERATION_CONCURRENCY,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setPreparing(false);
    }
  }

  function retryChunk(chunk: Chunk) {
    if (run.current) void runChunk(run.current, chunk);
  }

  function adIsSelected(ad: GeneratedAd) {
    return !deselectedIds.has(ad.id);
  }

  function toggleAd(ad: GeneratedAd) {
    setDeselectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ad.id)) next.delete(ad.id);
      else next.add(ad.id);
      return next;
    });
  }

  function downloadAds(list: GeneratedAd[]) {
    for (const ad of list) {
      const a = document.createElement("a");
      a.href = ad.imageUrl;
      a.download = fileNameFor(ad);
      a.click();
    }
  }

  function fileNameFor(ad: GeneratedAd) {
    const base = refName(ad.batchId).replace(/\.[^.]+$/, "") || "ad";
    const ext = extensionOf(ad.imageUrl);
    return `${brand.id}-${base}-${ad.dimension}-${ad.variation}.${ext}`.replace(
      /\s+/g,
      "_",
    );
  }

  const dimensionOrder = run.current?.brief.dimensions ?? dimensions;
  const adsInGroup = (groupId: string) =>
    ads
      .filter((ad) => ad.batchId === groupId)
      .sort(
        (a, b) =>
          a.variation - b.variation ||
          dimensionOrder.indexOf(a.dimension) - dimensionOrder.indexOf(b.dimension),
      );
  const galleryAds = resultBatches.flatMap((b) => adsInGroup(b.id));
  const groupNames = Object.fromEntries(
    resultBatches.map((b) => [b.id, batchLabel(b)]),
  );

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
                  {brand.name}{" "}
                  <span className="text-zinc-400">
                    (switch with the tabs above)
                  </span>
                </p>
              </div>

              <div className="field">
                <span>Dimension formats *</span>
                <div className="flex gap-2">
                  {DIMENSIONS.map((d) => {
                    const checked = dimensions.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={checked}
                        onClick={() =>
                          setDimensions((prev) => {
                            if (prev.includes(d)) {
                              if (prev.length === 1) return prev;
                              return prev.filter((x) => x !== d);
                            }
                            return DIMENSIONS.filter((x) => x === d || prev.includes(x));
                          })
                        }
                        className={`rounded-lg border px-3 py-1.5 text-sm ${
                          checked
                            ? "border-brand bg-brand text-white"
                            : "border-zinc-300 bg-white text-zinc-700"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <span className="font-normal text-zinc-400">
                  {dimensions.length > 1
                    ? `Generated in ${dimensions[0]}. Each image is then sent back to the model to be resized to ${dimensions.slice(1).join(" and ")}.`
                    : "Images are generated in this size."}
                </span>
              </div>

              <div className="col-span-2">
                <ProductPicker
                  products={brand.products}
                  selectedId={productId}
                  radioName={`product-${brand.id}`}
                  onSelect={setProductId}
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
                <span className="flex items-center justify-between">
                  Variations per reference
                  <span className="font-semibold text-zinc-900 tabular-nums">{targetAds}</span>
                </span>
                <input
                  type="range"
                  min={MIN_VARIATIONS_PER_REFERENCE}
                  max={MAX_VARIATIONS_PER_REFERENCE}
                  step={1}
                  value={targetAds}
                  onChange={(e) => setTargetAds(Number(e.target.value))}
                  aria-valuemin={MIN_VARIATIONS_PER_REFERENCE}
                  aria-valuemax={MAX_VARIATIONS_PER_REFERENCE}
                  aria-valuenow={targetAds}
                  className="w-full accent-brand"
                />
                <span className="flex justify-between font-normal text-zinc-400">
                  <span>{MIN_VARIATIONS_PER_REFERENCE}</span>
                  <span>{MAX_VARIATIONS_PER_REFERENCE}</span>
                </span>
                <span className="font-normal text-zinc-400">
                  Each reference image generates this many variations.
                </span>
              </label>

              <label className="field">
                <span>Copy</span>
                <select
                  value={copyMode}
                  onChange={(e) => setCopyMode(e.target.value as CopyMode)}
                >
                  <option value="separate">
                    Copy separate (no text in image)
                  </option>
                  <option value="in-image">Render copy in image</option>
                </select>
              </label>
              {copyMode === "in-image" ? (
                <label className="field">
                  <span>Ad copy</span>
                  <textarea
                    rows={2}
                    value={copy}
                    onChange={(e) => setCopy(e.target.value)}
                  />
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
                        onClick={() =>
                          setLandingPages((prev) =>
                            prev.filter((_, j) => j !== i),
                          )
                        }
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
                  onClick={() =>
                    console.log(
                      `[${brand.name}] creative breakdown`,
                      breakdowns,
                    )
                  }
                >
                  Log to console
                </button>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1 text-xs"
                  onClick={() =>
                    void navigator.clipboard.writeText(breakdownJson)
                  }
                >
                  Copy JSON
                </button>
              </div>
              <pre className="m-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
                {breakdownJson}
              </pre>
            </details>
          </section>

          <footer className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              {inputsMissing.length > 0
                ? `Still needed: ${inputsMissing.join(", ")}`
                : "Creative input is complete."}
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
            <div
              role="radiogroup"
              className="grid grid-cols-1 gap-3 md:grid-cols-2"
            >
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
                      selected
                        ? "border-brand bg-brand/5"
                        : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <span className="text-sm font-semibold">{s.title}</span>
                    <span className="text-sm text-zinc-500">
                      {s.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {referenceSource === "library" && (
            <LibraryBrowser
              suggestedQuery={brief.keywords.join(" ")}
              groupNames={groups.map((g) => g.name)}
              addedTo={libraryUsage}
              onAdd={addLibraryAds}
              onRemove={removeLibraryAd}
            />
          )}

          <section className="card">
            <h2 className="section-title mb-1">References *</h2>
            <p className="mb-5 text-sm text-zinc-500">
              Each group generates its own batch. Every reference image in a
              group gets the number of variations you set. A group needs at
              least one style or format reference.
            </p>

            <div className="flex flex-col gap-4">
              {groupIds.map((groupId, groupIndex) => {
                const batch = batches.find((b) => b.id === groupId);
                return (
                  <div
                    key={groupId}
                    className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <input
                          value={groups[groupIndex].name}
                          onChange={(e) => renameGroup(groupId, e.target.value)}
                          aria-label={`Name for group ${groupIndex + 1}`}
                          placeholder={`Group ${groupIndex + 1}`}
                          className="min-w-0 max-w-xs rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-zinc-900 outline-none hover:border-zinc-300 focus:border-brand focus:bg-white"
                        />
                        <span className="shrink-0 text-sm font-normal text-zinc-400">
                          {batch
                            ? `· ${batch.count * dimensions.length} ads`
                            : "· needs a reference"}
                        </span>
                      </div>
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
                        const set = references.filter(
                          (r) => r.groupId === groupId && r.role === role,
                        );
                        return (
                          <DropZone
                            key={role}
                            className="flex flex-col gap-3"
                            onFiles={(files) =>
                              addReferences(groupId, role, files)
                            }
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-sm font-medium">
                                  {REFERENCE_ROLE_LABELS[role]}s{" "}
                                  <span className="font-normal text-zinc-400">
                                    ({set.length})
                                  </span>
                                </h4>
                                <p className="text-xs text-zinc-500">
                                  {REFERENCE_ROLE_HINTS[role]}
                                </p>
                              </div>
                              <label className="shrink-0 cursor-pointer rounded-lg bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand/85">
                                Upload
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={(e) => {
                                    addReferences(
                                      groupId,
                                      role,
                                      e.target.files,
                                    );
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
                                    addReferences(
                                      groupId,
                                      role,
                                      e.target.files,
                                    );
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
                                    setReferences((prev) =>
                                      prev.map((x) =>
                                        x.id === r.id ? next : x,
                                      ),
                                    )
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
            <button
              type="button"
              onClick={() => setStage("inputs")}
              className="btn-secondary"
            >
              Back
            </button>
            <p className="flex-1 text-right text-sm text-zinc-500">
              {referencesMissing.length > 0
                ? `Still needed: ${referencesMissing.join(", ")}`
                : totalAds > MAX_TOTAL_ADS
                  ? `${totalAds} ads is over the ${MAX_TOTAL_ADS} ad limit for one run.`
                  : `${totalAds} ads (${dimensions.join(", ")}) across ${batches.length} group${batches.length === 1 ? "" : "s"}`}
            </p>
            <button
              type="button"
              disabled={!canReview}
              onClick={() => setStage("review")}
              className="btn-primary"
            >
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
              <dt className="text-zinc-500">Product</dt>
              <dd>{brief.products.map((p) => p.name).join(", ")}</dd>
              <dt className="text-zinc-500">Product in the ad</dt>
              <dd>
                {productVisibility === "secondary"
                  ? `Secondary · ${
                      selectedProducts.filter(
                        (p) => productPhotos[p.id] || p.image,
                      ).length
                    }/${selectedProducts.length} with photos`
                  : "No product"}
              </dd>
              <dt className="text-zinc-500">Dimensions</dt>
              <dd>{brief.dimensions.join(", ")}</dd>
              <dt className="text-zinc-500">Keywords</dt>
              <dd>{brief.keywords.join(", ") || "None"}</dd>
              <dt className="text-zinc-500">Copy</dt>
              <dd>
                {copyMode === "separate" ? "Separate" : `In image: "${copy}"`}
              </dd>
              <dt className="text-zinc-500">Landing pages</dt>
              <dd>{landingPages.map((lp) => lp.title).join(", ") || "None"}</dd>
              <dt className="text-zinc-500">Variations</dt>
              <dd>
                {targetAds} per reference · {totalAds} ads across {batches.length} group
                {batches.length === 1 ? "" : "s"}
              </dd>
            </dl>

            <div className="mt-6 flex flex-col gap-3">
              {batches.map((b) => (
                <div key={b.id} className="rounded-lg bg-zinc-50 p-3 text-sm">
                  <p className="mb-2 font-medium">
                    {batchLabel(b)}{" "}
                    <span className="font-normal text-zinc-500">
                      · {b.count} ads
                    </span>
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {b.jobs.map((j) => (
                      <div
                        key={`${j.style?.id}-${j.format?.id}`}
                        className="flex items-center gap-2"
                      >
                        {[j.style, j.format].map(
                          (ref) =>
                            ref && (
                              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                              <img
                                key={ref.id}
                                src={
                                  references.find((d) => d.id === ref.id)
                                    ?.previewUrl
                                }
                                alt=""
                                className="h-12 w-9 rounded object-cover"
                              />
                            ),
                        )}
                        <span className="min-w-0 flex-1 truncate text-zinc-600">
                          {j.style ? `style ${j.style.fileName}` : "new style"}{" "}
                          ×{" "}
                          {j.format
                            ? `format ${j.format.fileName}`
                            : "new layout"}
                        </span>
                        <span className="text-zinc-500">{j.count} ads</span>
                        {[j.style, j.format].map(
                          (ref) =>
                            ref && (
                              <ScoreBadge key={ref.id} metrics={ref.metrics} />
                            ),
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <details className="mt-6">
              <summary className="cursor-pointer text-xs font-medium text-zinc-600">
                Brief JSON
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
                {JSON.stringify(brief, null, 2)}
              </pre>
            </details>
          </section>

          <section className="card">
            <h2 className="section-title">Image generation</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                <span>Model</span>
                <select
                  value={options.model}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      model: e.target.value as GenerationOptions["model"],
                    }))
                  }
                >
                  {GENERATION_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              {providerOf(options.model) === "openai" && (
                <label className="field">
                  <span>Quality</span>
                  <select
                    value={options.openaiQuality}
                    onChange={(e) =>
                      setOptions((o) => ({
                        ...o,
                        openaiQuality: e.target
                          .value as GenerationOptions["openaiQuality"],
                      }))
                    }
                  >
                    {IMAGE_QUALITIES.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {providerOf(options.model) === "gemini" && (
                <label className="field">
                  <span>Image size</span>
                  <select
                    value={options.geminiImageSize}
                    onChange={(e) =>
                      setOptions((o) => ({
                        ...o,
                        geminiImageSize: e.target
                          .value as GenerationOptions["geminiImageSize"],
                      }))
                    }
                  >
                    {GEMINI_IMAGE_SIZES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              {providerOf(options.model) === "mock"
                ? "Mock makes placeholder images from your references; nothing is sent to an image API."
                : dimensions.length > 1
                  ? `Generates ${totalAds / dimensions.length} images with the model in ${dimensions[0]}, then asks the model to resize each one to ${dimensions.slice(1).join(" and ")} (${totalAds} images in total, each billed by the provider). Every group's style/format pairing runs as its own request, ${GENERATION_CONCURRENCY} at a time.`
                  : `Generates ${totalAds} image${totalAds === 1 ? "" : "s"}, each billed by the provider. Every group's style/format pairing runs as its own request, ${GENERATION_CONCURRENCY} at a time.`}
            </p>
          </section>

          {error && (
            <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          )}

          <footer className="flex justify-between">
            <button
              type="button"
              onClick={() => setStage("references")}
              className="btn-secondary"
              disabled={generating}
            >
              Back to references
            </button>
            <button
              type="button"
              onClick={generate}
              className="btn-primary"
              disabled={generating}
            >
              {generating
                ? "Generating…"
                : `Confirm & generate ${totalAds} ads`}
            </button>
          </footer>
        </div>
      )}

      {stage === "results" && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <p
              className="flex items-center gap-2 text-sm text-zinc-500"
              role="status"
            >
              {generating && (
                <span
                  className="size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
                  aria-hidden
                />
              )}
              {ads.length} of {chunks.reduce((sum, c) => sum + c.count, 0) * Math.max(dimensionOrder.length, 1)} ads
              generated with{" "}
              <code>
                {GENERATION_MODELS.find((m) => m.id === runOptions.model)
                  ?.label ?? runOptions.model}
              </code>
              {!generating && chunks.some((c) => c.status === "error") && (
                <span className="text-rose-600">
                  · {chunks.filter((c) => c.status === "error").length}{" "}
                  request(s) failed
                </span>
              )}
            </p>
          </div>

          {resultBatches.map((b) => {
            const groupChunks = chunks.filter((c) => c.groupId === b.id);
            const groupAds = adsInGroup(b.id);
            const groupSelected = groupAds.filter((ad) => adIsSelected(ad));
            const groupAllSelected = groupSelected.length === groupAds.length;
            const done = groupChunks.filter((c) => c.status === "done").length;
            const columnCount = groupChunks.reduce((sum, c) => sum + c.count, 0);
            return (
              <section key={b.id} className="card">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="section-title mb-0">
                    {batchLabel(b)}{" "}
                    <span className="text-sm font-normal text-zinc-500">
                      · {done}/{groupChunks.length} requests done
                    </span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => downloadAds(groupSelected)}
                    disabled={groupSelected.length === 0}
                    className="btn-primary"
                  >
                    {groupAllSelected
                      ? "Download all"
                      : `Download selected images (${groupSelected.length})`}
                  </button>
                </div>
                {groupChunks.map(
                  (c) =>
                    (c.status === "error" ||
                      (c.failures && c.failures.length > 0)) && (
                      <div
                        key={`${c.key}-error`}
                        role="alert"
                        className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
                      >
                        <p>
                          {[c.styleRefId, c.formatRefId]
                            .filter(Boolean)
                            .map((id) => refName(id))
                            .join(" × ")}{" "}
                          · {c.dimension}:{" "}
                          {c.status === "error" ? c.error : c.failures!.join("; ")}
                        </p>
                        {c.status === "error" && (
                          <button
                            type="button"
                            onClick={() => retryChunk(c)}
                            className="mt-1 text-xs font-medium underline"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    ),
                )}
                <div className="overflow-x-auto">
                  <div
                    className="flex flex-col gap-8"
                    style={{
                      minWidth:
                        columnCount > 0
                          ? `calc(${columnCount} * 11rem + ${Math.max(columnCount - 1, 0)} * 1rem)`
                          : undefined,
                    }}
                  >
                    {dimensionOrder.map((dimension) => {
                      const columns = groupChunks.flatMap((c) =>
                        Array.from({ length: c.count }, (_, i) => ({
                          key: `${c.key}-${dimension}-${c.variationStart + i}`,
                          chunk: c,
                          variation: c.variationStart + i,
                        })),
                      );
                      return (
                        <div key={dimension}>
                          <p className="mb-2 text-sm font-semibold text-zinc-800">{dimension}</p>
                          <div
                            className="grid gap-4"
                            style={{
                              gridTemplateColumns: `repeat(${Math.max(columnCount, 1)}, minmax(11rem, 1fr))`,
                            }}
                          >
                            {columns.map(({ key, chunk, variation }) => {
                              const ad = groupAds.find(
                                (item) =>
                                  item.styleRefId === chunk.styleRefId &&
                                  item.formatRefId === chunk.formatRefId &&
                                  item.dimension === dimension &&
                                  item.variation === variation,
                              );
                              if (ad) {
                                return (
                                  <ResultFigure
                                    key={ad.id}
                                    ad={ad}
                                    selected={adIsSelected(ad)}
                                    downloadName={fileNameFor(ad)}
                                    onOpen={() => setOpenAdId(ad.id)}
                                    onToggle={() => toggleAd(ad)}
                                  />
                                );
                              }
                              const sourceReady = groupAds.some(
                                (item) =>
                                  item.styleRefId === chunk.styleRefId &&
                                  item.formatRefId === chunk.formatRefId &&
                                  item.dimension === chunk.dimension &&
                                  item.variation === variation,
                              );
                              const waiting =
                                chunk.status === "pending" || chunk.status === "running";
                              const label =
                                dimension === chunk.dimension
                                  ? chunk.status === "running"
                                    ? "Generating…"
                                    : chunk.status === "pending"
                                      ? "Queued"
                                      : undefined
                                  : waiting && sourceReady
                                    ? "Resizing…"
                                    : waiting
                                      ? "Waiting"
                                      : undefined;
                              return (
                                <div key={key} className="flex flex-col gap-1">
                                  <p className="text-left text-xs font-semibold text-zinc-800">#{variation}</p>
                                  <div
                                    className={`${ASPECT_CLASSES[dimension]} flex w-full items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-400 ${
                                      label ? "animate-pulse" : ""
                                    }`}
                                  >
                                    {label}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}
          {openAdId && galleryAds.some((ad) => ad.id === openAdId) && (
            <GenerationLightbox
              ads={galleryAds}
              startId={openAdId}
              groupNames={groupNames}
              isSelected={adIsSelected}
              onToggleSelected={toggleAd}
              onClose={() => setOpenAdId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
