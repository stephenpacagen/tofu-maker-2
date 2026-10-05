"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { countAds, pairGap, planBatches, splitEvenly, type Batch } from "@/lib/batches";
import { filesForUpload } from "@/lib/upload-image";
import { zipFolder } from "@/lib/zip-folder";
import type { Brand } from "@/lib/brands";
import { toInputBreakdown, toReferenceBreakdown } from "@/lib/breakdown";
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
import { ReferenceCart } from "./ReferenceCart";
import {
  ReferenceCard,
  ScoreBadge,
  type ReferenceDraft,
} from "./ReferenceCard";

/** Developer-only JSON panels on Creative input and References. Flip this to show them. */
const SHOW_CREATIVE_BREAKDOWN = false;

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

function ProgressBar({
  stage,
  onSelect,
}: {
  stage: Stage;
  onSelect: (stage: Stage) => void;
}) {
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
            const clickable = stage !== "results" && done;
            const marker = (
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                  done || active
                    ? "border-brand bg-brand text-white"
                    : "border-zinc-300 bg-white text-zinc-400"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
            );
            const label = (
              <span
                className={`text-xs whitespace-nowrap ${
                  active ? "font-medium text-zinc-900" : "text-zinc-500"
                } ${clickable ? "underline-offset-2 group-hover:underline" : ""}`}
              >
                {s.label}
              </span>
            );
            return (
              <li key={s.id} className="flex w-0 flex-col items-center">
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className="group flex cursor-pointer flex-col items-center gap-2"
                  >
                    {marker}
                    {label}
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    {marker}
                    {label}
                  </div>
                )}
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

function variationKey(
  ad: Pick<GeneratedAd, "batchId" | "styleRefId" | "formatRefId" | "variation">,
) {
  return `${ad.batchId}-${ad.styleRefId ?? "none"}-${ad.formatRefId ?? "none"}-${ad.variation}`;
}

type ImageJobResponse =
  | { imageUrl: string; prompt: string; failures: string[] }
  | { error: string };

async function postImageJob(
  path: string,
  fields: Record<string, string>,
  files: { name: string; file: File }[],
): Promise<ImageJobResponse> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (const item of await filesForUpload(files)) form.append(item.name, item.file);
  const res = await fetch(path, { method: "POST", body: form });
  return (await res.json().catch(() => ({
    error: `Request failed (${res.status} ${res.statusText})`,
  }))) as ImageJobResponse;
}

function ResultFigure({
  ad,
  selected,
  downloadName,
  loading,
  onOpen,
  onToggle,
  regenerate,
}: {
  ad: GeneratedAd;
  selected: boolean;
  downloadName: string;
  loading?: boolean;
  onOpen: () => void;
  onToggle: () => void;
  regenerate?: {
    error?: string;
    hasOriginal: boolean;
    showingOriginal: boolean;
    onOpenForm: () => void;
    onToggleOriginal: () => void;
  };
}) {
  return (
    <figure className="flex w-full min-w-0 flex-col gap-1">
      <p className="text-left text-xs font-semibold text-zinc-800">
        #{ad.variation}
      </p>
      <div className="relative">
        {loading ? (
          <div
            className={`${ASPECT_CLASSES[ad.dimension]} flex w-full animate-pulse items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-400`}
          >
            Regenerating…
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`View variation ${ad.variation} full screen`}
            aria-pressed={selected}
            className={`block w-full min-w-0 cursor-zoom-in rounded-lg text-left ring-2 ring-offset-2 ${
              selected ? "ring-brand" : "ring-transparent"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
            <img
              src={ad.imageUrl}
              alt={`${ad.dimension} variation ${ad.variation}`}
              title={ad.prompt}
              className="h-auto w-full max-w-full rounded-lg bg-zinc-100 object-contain"
            />
          </button>
        )}
        {!loading && (
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
                <path
                  d="M3.5 8.5 6.5 11.5 12.5 4.5"
                  className={selected ? "" : "opacity-0"}
                />
              </svg>
            </span>
          </label>
        )}
      </div>
      {loading ? (
        <span className="mx-auto mt-1 inline-flex items-center justify-center rounded-full border border-zinc-200 px-4 py-1.5 text-xs font-medium text-zinc-400">
          Download
        </span>
      ) : (
        <a
          href={ad.imageUrl}
          download={downloadName}
          className="mx-auto mt-1 inline-flex max-w-full items-center justify-center rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm transition hover:border-brand hover:text-brand"
        >
          Download
        </a>
      )}
      {regenerate && (
        <div className="mt-1 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={regenerate.onOpenForm}
            disabled={loading}
            className="mx-auto inline-flex max-w-full items-center justify-center rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm transition hover:border-brand hover:text-brand disabled:cursor-default disabled:border-zinc-200 disabled:text-zinc-400 disabled:hover:text-zinc-400"
          >
            Regenerate
          </button>
          {regenerate.error && (
            <p className="text-center text-xs text-rose-600">
              {regenerate.error}
            </p>
          )}
          {regenerate.hasOriginal && !loading && (
            <button
              type="button"
              onClick={regenerate.onToggleOriginal}
              className="mx-auto text-xs font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-brand"
            >
              {regenerate.showingOriginal
                ? "View regenerated"
                : "View original"}
            </button>
          )}
        </div>
      )}
    </figure>
  );
}

function RegenerateDialog({
  imageUrl,
  variation,
  dimension,
  instruction,
  showOthers,
  alsoOthers,
  onInstruction,
  onAlsoOthers,
  onExtra,
  onCancel,
  onSubmit,
}: {
  imageUrl: string;
  variation: number;
  dimension: Dimension;
  instruction: string;
  showOthers: boolean;
  alsoOthers: boolean;
  onInstruction: (value: string) => void;
  onAlsoOthers: (checked: boolean) => void;
  onExtra: (file: File | null) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`Regenerate variation ${variation}`}
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
        <img
          src={imageUrl}
          alt={`${dimension} variation ${variation}`}
          className="mx-auto max-h-[50vh] w-auto max-w-full rounded-lg bg-zinc-100 object-contain"
        />
        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          Further instructions
          <textarea
            value={instruction}
            onChange={(event) => onInstruction(event.target.value)}
            rows={4}
            placeholder="What should change in this image?"
            aria-label={`Instructions for variation ${variation}`}
            className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-brand"
            autoFocus
          />
        </label>
        {showOthers && (
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={alsoOthers}
              onChange={(event) => onAlsoOthers(event.target.checked)}
              className="mt-0.5"
            />
            Also regenerate the other formats
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          Additional image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => onExtra(event.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-full file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1 file:text-sm"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!instruction.trim()}
            className="btn-primary"
          >
            Regenerate
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function StartNewAdSetDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-ad-set-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="new-ad-set-title" className="text-lg font-semibold text-zinc-900">
          Start a new ad set?
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          Are you sure you want to start a new one? The generations you&apos;ve
          made here will disappear forever. Make sure you download what you want
          to keep!
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Go back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
          >
            Yes, I&apos;m Sure!
          </button>
        </div>
      </div>
    </div>,
    document.body,
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

function saveDownload(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

function uniqueDownloadName(name: string, used: Map<string, number>) {
  const count = used.get(name) ?? 0;
  used.set(name, count + 1);
  if (count === 0) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  return `${stem}-${count + 1}${ext}`;
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

type ThumbDirection = "left" | "right" | "up" | "down";

/** Moves one cell in the thumbnail grid: columns are variations, rows are formats. */
function thumbnailNeighbor(ads: GeneratedAd[], from: number, direction: ThumbDirection): number {
  const groups: {
    id: string;
    rows: Dimension[];
    cols: number[];
    at: Map<string, number>;
  }[] = [];
  ads.forEach((ad, adIndex) => {
    let group = groups[groups.length - 1];
    if (!group || group.id !== ad.batchId) {
      group = { id: ad.batchId, rows: [], cols: [], at: new Map() };
      groups.push(group);
    }
    if (!group.rows.includes(ad.dimension)) group.rows.push(ad.dimension);
    if (!group.cols.includes(ad.variation)) group.cols.push(ad.variation);
    group.at.set(`${ad.dimension}:${ad.variation}`, adIndex);
  });

  let gi = groups.findIndex((group) => [...group.at.values()].includes(from));
  const current = ads[from];
  if (!current || gi < 0) return from;
  let ri = groups[gi].rows.indexOf(current.dimension);
  let ci = groups[gi].cols.indexOf(current.variation);
  const horizontal = direction === "left" || direction === "right";
  const delta = direction === "right" || direction === "down" ? 1 : -1;

  for (let guard = 0; guard < ads.length; guard++) {
    if (horizontal) ci += delta;
    else ri += delta;

    let placed = false;
    while (!placed) {
      if (gi < 0 || gi >= groups.length) return from;
      const group = groups[gi];
      if (ci < 0) {
        gi -= 1;
        if (gi < 0) return from;
        ci = groups[gi].cols.length - 1;
        ri = Math.min(Math.max(ri, 0), groups[gi].rows.length - 1);
        continue;
      }
      if (ci >= group.cols.length) {
        gi += 1;
        if (gi >= groups.length) return from;
        ci = 0;
        ri = Math.min(Math.max(ri, 0), groups[gi].rows.length - 1);
        continue;
      }
      if (ri < 0) {
        gi -= 1;
        if (gi < 0) return from;
        ri = groups[gi].rows.length - 1;
        ci = Math.min(Math.max(ci, 0), groups[gi].cols.length - 1);
        continue;
      }
      if (ri >= group.rows.length) {
        gi += 1;
        if (gi >= groups.length) return from;
        ri = 0;
        ci = Math.min(Math.max(ci, 0), groups[gi].cols.length - 1);
        continue;
      }
      placed = true;
    }

    const group = groups[gi];
    const next = group.at.get(`${group.rows[ri]}:${group.cols[ci]}`);
    if (next !== undefined) return next;
  }
  return from;
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
  const activeThumb = useRef<HTMLButtonElement>(null);
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
    activeThumb.current?.scrollIntoView({ block: "nearest" });
  }, [index]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const node = el;

    function step(delta: number) {
      const width = node.clientWidth;
      if (!width) return;
      const current = Math.round(node.scrollLeft / width);
      const next = Math.min(ads.length - 1, Math.max(0, current + delta));
      node.scrollLeft = next * width;
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const direction: ThumbDirection | null =
        e.key === "ArrowLeft"
          ? "left"
          : e.key === "ArrowRight"
            ? "right"
            : e.key === "ArrowUp"
              ? "up"
              : e.key === "ArrowDown"
                ? "down"
                : null;
      if (!direction) return;
      e.preventDefault();
      const width = node.clientWidth;
      if (!width) return;
      const current = Math.round(node.scrollLeft / width);
      const next = thumbnailNeighbor(ads, current, direction);
      if (next !== current) {
        node.scrollLeft = next * width;
        setIndex(next);
      }
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
  }, [ads, onClose]);

  if (typeof document === "undefined") return null;

  function scrollToIndex(next: number) {
    const el = scroller.current;
    const width = el?.clientWidth ?? 0;
    if (!el || !width) return;
    const clamped = Math.min(ads.length - 1, Math.max(0, next));
    el.scrollLeft = clamped * width;
    setIndex(clamped);
  }

  function stepFromButton(delta: number) {
    const el = scroller.current;
    const width = el?.clientWidth ?? 0;
    if (!el || !width) return;
    const current = Math.round(el.scrollLeft / width);
    scrollToIndex(current + delta);
  }

  const thumbnailGroups: {
    id: string;
    name: string;
    items: { ad: GeneratedAd; index: number }[];
  }[] = [];
  for (let i = 0; i < ads.length; i++) {
    const ad = ads[i];
    const last = thumbnailGroups[thumbnailGroups.length - 1];
    if (!last || last.id !== ad.batchId) {
      thumbnailGroups.push({
        id: ad.batchId,
        name: groupNames[ad.batchId] ?? "Reference group",
        items: [],
      });
    }
    thumbnailGroups[thumbnailGroups.length - 1].items.push({ ad, index: i });
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Generated ads"
      className="fixed inset-0 z-50 flex bg-black/90"
    >
      <div className="relative min-w-0 flex-1">
        {ads[index] && (
          <div className="pointer-events-none absolute top-6 left-6 z-10 max-w-[70%] text-left text-white">
            <p className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {groupNames[ads[index].batchId] ?? "Reference group"}
            </p>
            <p className="mt-1 text-2xl font-medium sm:text-3xl">
              #{ads[index].variation} · {ads[index].dimension}
              {ads.length > 1 && (
                <span className="text-white/70">
                  {" "}
                  · {index + 1} / {ads.length}
                </span>
              )}
            </p>
          </div>
        )}
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
            className="absolute top-1/2 right-3 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 disabled:opacity-30"
          >
            ›
          </button>
        )}
      </div>
      <aside className="flex h-full w-[min(46vw,34rem)] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/15 bg-black/50 p-3 pt-16">
        {thumbnailGroups.map((group) => {
          const rowDimensions: Dimension[] = [];
          const columnVariations: number[] = [];
          for (const { ad } of group.items) {
            if (!rowDimensions.includes(ad.dimension)) rowDimensions.push(ad.dimension);
            if (!columnVariations.includes(ad.variation)) columnVariations.push(ad.variation);
          }
          return (
            <section
              key={group.id}
              className="rounded-lg border border-white/30 p-2"
            >
              <p className="mb-2 text-xs font-semibold text-white">{group.name}</p>
              <div className="flex w-full flex-col gap-3">
                {rowDimensions.map((dimension) => (
                  <div key={dimension} className="w-full">
                    <p className="mb-1 text-[11px] font-semibold text-white">{dimension}</p>
                    <div
                      className="grid w-full gap-1.5"
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(columnVariations.length, 1)}, minmax(0, 1fr))`,
                      }}
                    >
                      {columnVariations.map((variation) => {
                        const item = group.items.find(
                          (entry) =>
                            entry.ad.dimension === dimension && entry.ad.variation === variation,
                        );
                        if (!item) return <div key={`${dimension}-${variation}`} />;
                        const { ad, index: adIndex } = item;
                        return (
                          <button
                            key={ad.id}
                            type="button"
                            aria-current={adIndex === index}
                            aria-label={`${group.name} variation ${ad.variation} ${ad.dimension}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => scrollToIndex(adIndex)}
                            ref={adIndex === index ? activeThumb : undefined}
                            className={`w-full min-w-0 overflow-hidden rounded-md text-left outline-none ${
                              adIndex === index
                                ? "ring-2 ring-white ring-offset-1 ring-offset-black"
                                : ""
                            }`}
                          >
                            <span className="block px-0.5 text-[10px] font-semibold text-white">
                              #{ad.variation}
                            </span>
                            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
                            <img
                              src={ad.imageUrl}
                              alt=""
                              className="h-auto w-full bg-zinc-900 object-contain"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </aside>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
      >
        Close
      </button>
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

type ReferenceGroupDraft = { id: string; name: string; description: string };

function splitAttributes(raw: string) {
  return raw
    .split(";")
    .map((attribute) => attribute.trim())
    .filter(Boolean);
}

function uniqueKeywords(keywords: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const keyword of keywords) {
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(keyword);
  }
  return unique;
}

function CreativeBreakdownPanel({
  title,
  json,
  data,
  brandName,
}: {
  title: string;
  json: string;
  data: unknown;
  brandName: string;
}) {
  return (
    <details className="mt-6 rounded-lg border border-zinc-200" open>
      <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-zinc-600">
        {title}
      </summary>
      <div className="flex gap-2 px-4 pt-1">
        <button
          type="button"
          className="btn-secondary px-3 py-1 text-xs"
          onClick={() => console.log(`[${brandName}] ${title}`, data)}
        >
          Log to console
        </button>
        <button
          type="button"
          className="btn-secondary px-3 py-1 text-xs"
          onClick={() => void navigator.clipboard.writeText(json)}
        >
          Copy JSON
        </button>
      </div>
      <pre className="m-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
        {json}
      </pre>
    </details>
  );
}

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
  const [cartOpen, setCartOpen] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [stage]);
  const [referenceSource, setReferenceSource] =
    useState<ReferenceSource>("upload");
  const [productId, setProductId] = useState<string | null>(null);
  const [productPhotos, setProductPhotos] = useState<Record<string, File>>({});
  const [dimensions, setDimensions] = useState<Dimension[]>(["4x5"]);
  const [copyMode, setCopyMode] = useState<CopyMode>("separate");
  const [copy, setCopy] = useState("");
  const [productVisibility, setProductVisibility] =
    useState<ProductVisibility>("secondary");
  const [targetAds, setTargetAds] = useState(4);
  const [variationsText, setVariationsText] = useState("4");
  const [landingPages, setLandingPages] = useState<LandingPage[]>([]);
  const [landingUrl, setLandingUrl] = useState("");
  const [landingError, setLandingError] = useState<string | null>(null);
  const [landingLoading, setLandingLoading] = useState(false);
  const [groups, setGroups] = useState<ReferenceGroupDraft[]>(() => [
    { id: crypto.randomUUID(), name: "Reference group 1", description: "" },
  ]);
  const groupIds = groups.map((g) => g.id);
  const [references, setReferences] = useState<ReferenceDraft[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [ads, setAds] = useState<GeneratedAd[]>([]);
  const [openAdId, setOpenAdId] = useState<string | null>(null);
  const [confirmNewAdSet, setConfirmNewAdSet] = useState(false);
  // Images start unselected. Only ids in this set are included in downloads.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [originals, setOriginals] = useState<
    Record<string, { imageUrl: string; prompt: string }>
  >({});
  const [showingOriginal, setShowingOriginal] = useState<Set<string>>(
    new Set(),
  );
  const [regeneratingKeys, setRegeneratingKeys] = useState<Set<string>>(
    new Set(),
  );
  const [regenEditor, setRegenEditor] = useState<{
    key: string;
    dimension: Dimension;
    imageUrl: string;
    variation: number;
  } | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [regenOthers, setRegenOthers] = useState(true);
  const [regenExtra, setRegenExtra] = useState<File | null>(null);
  const [regenErrors, setRegenErrors] = useState<Record<string, string>>({});
  const adsRef = useRef<GeneratedAd[]>([]);
  adsRef.current = ads;
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
    keywords: uniqueKeywords(
      groups.flatMap((g) => splitAttributes(g.description)),
    ),
    targetAds,
    copyMode,
    copy,
    landingPages: copyMode === "in-image" ? landingPages : [],
    referenceGroups: groups.map(({ id, name, description }) => ({
      id,
      name,
      description,
      keywords: splitAttributes(description),
    })),
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
  const stepOneBreakdown = toInputBreakdown(brief, brand.id);
  const stepOneJson = JSON.stringify(stepOneBreakdown, null, 2);
  const stepTwoBreakdown = toReferenceBreakdown(brief, brand.id);
  const stepTwoJson = JSON.stringify(stepTwoBreakdown, null, 2);

  const referencesMissing = groups
    .map((g, i) => {
      const name = g.name.trim() || `Reference group ${i + 1}`;
      const gap = pairGap(references.filter((r) => r.groupId === g.id));
      if (gap === "both") return `a style reference and a format reference in ${name}`;
      if (gap === "style") return `a style reference in ${name}`;
      if (gap === "format") return `a format reference in ${name}`;
      return null;
    })
    .filter((n) => n !== null);
  const variationsNumber = /^\d+$/.test(variationsText)
    ? Number(variationsText)
    : null;
  const variationsOutOfRange =
    variationsNumber !== null &&
    (variationsNumber < MIN_VARIATIONS_PER_REFERENCE ||
      variationsNumber > MAX_VARIATIONS_PER_REFERENCE);
  const inputsMissing = [
    brief.products.length === 0 && "a product",
    dimensions.length === 0 && "a dimension",
    (variationsNumber === null || variationsOutOfRange) &&
      `variations from ${MIN_VARIATIONS_PER_REFERENCE} to ${MAX_VARIATIONS_PER_REFERENCE}`,
  ].filter(Boolean);
  const canReview =
    inputsMissing.length === 0 &&
    referencesMissing.length === 0 &&
    totalAds <= MAX_TOTAL_ADS;

  function addGroup() {
    setGroups((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Reference group ${prev.length + 1}`,
        description: prev[prev.length - 1]?.description ?? "",
      },
    ]);
  }

  function renameGroup(groupId: string, name: string) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name } : g)),
    );
  }

  function setGroupDescription(groupId: string, description: string) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, description } : g)),
    );
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
    if (drafts.length > 0) setCartOpen(true);
  }

  async function addLibraryAds(
    ads: RankedLibraryAd[],
    groupIndex: number,
    role: ReferenceRole | "both",
  ) {
    const groupId = groupIds[groupIndex];
    const roles: ReferenceRole[] = role === "both" ? [...REFERENCE_ROLES] : [role];
    const drafts = await Promise.all(
      ads.map(async (ad): Promise<ReferenceDraft[]> => {
        const missing = roles.filter(
          (r) =>
            !references.some(
              (ref) =>
                ref.libraryAdId === ad.id &&
                ref.groupId === groupId &&
                ref.role === r,
            ),
        );
        if (missing.length === 0) return [];
        const ext = ad.imageUrl.startsWith("data:image/svg")
          ? "svg"
          : (ad.imageUrl.match(/\.(jpe?g|png|webp)(?:\?|$)/i)?.[1] ?? "jpg");
        const file = await fetchAsFile(
          ad.imageUrl,
          `${ad.brand}-${ad.id}.${ext}`.replace(/\s+/g, "_"),
        ).catch(() => null);
        if (!file) return [];
        return missing.map((r) => ({
          id: crypto.randomUUID(),
          groupId,
          file,
          previewUrl: URL.createObjectURL(file),
          role: r,
          prompt: "",
          metrics: ad.metrics,
          source: "sourced" as const,
          libraryAdId: ad.id,
          sourcedFrom: [ad.brand, ad.headline || ad.category]
            .filter(Boolean)
            .join(" · "),
        }));
      }),
    );
    const added = drafts.flat();
    setReferences((prev) => [...prev, ...added]);
    if (added.length > 0) setCartOpen(true);
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

  function moveReference(
    id: string,
    groupId: string,
    role: ReferenceRole,
    beforeId?: string,
  ) {
    setReferences((prev) => {
      const current = prev.find((r) => r.id === id);
      if (!current || beforeId === id) return prev;
      const moving = { ...current, groupId, role };
      const rest = prev.filter((r) => r.id !== id);
      const next = [...rest];
      if (!beforeId) {
        let insertAt = next.length;
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].groupId === groupId && next[i].role === role) {
            insertAt = i + 1;
            break;
          }
        }
        next.splice(insertAt, 0, moving);
        return next;
      }
      const index = next.findIndex((r) => r.id === beforeId);
      next.splice(index === -1 ? next.length : index, 0, moving);
      return next;
    });
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
    const inGroup = references.filter((x) => x.groupId === r.groupId);
    if (inGroup.length === 1) return `Used in ${count} ads · style and layout`;
    const otherRole = r.role === "style" ? "format" : "style";
    const groupHasOther = inGroup.some((x) => x.role === otherRole);
    return `Used in ${count} ads${groupHasOther ? "" : r.role === "style" ? " · new layout" : " · new style"}`;
  }

  function batchLabel(b: Batch) {
    return b.name.trim() || `Reference group ${b.index + 1}`;
  }

  async function addLandingPage(url: string) {
    const trimmed = url.trim();
    if (!trimmed || landingLoading) return;
    if (landingPages.length >= 5) {
      setLandingError("Add at most 5 landing pages");
      return;
    }
    setLandingLoading(true);
    setLandingError(null);
    try {
      const res = await fetch("/api/landing-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const json = (await res.json()) as LandingPage & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not read that page");
      setLandingPages((prev) =>
        prev.some((lp) => lp.fileName === json.fileName)
          ? prev
          : [...prev, json],
      );
      setLandingUrl("");
    } catch (error) {
      setLandingError(
        error instanceof Error ? error.message : "Could not read that page",
      );
    } finally {
      setLandingLoading(false);
    }
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
      const uploadFiles: { name: string; file: File }[] = [];
      for (const refId of new Set([chunk.styleRefId, chunk.formatRefId])) {
        if (!refId) continue;
        const file = ctx.referenceFiles.get(refId);
        if (file) uploadFiles.push({ name: `reference:${refId}`, file });
      }
      for (const [productId, file] of ctx.productFiles)
        uploadFiles.push({ name: `product:${productId}`, file });

      const form = new FormData();
      form.append("brief", JSON.stringify(ctx.brief));
      form.append("chunk", JSON.stringify(request));
      form.append("options", JSON.stringify(ctx.options));
      for (const item of await filesForUpload(uploadFiles)) form.append(item.name, item.file);

      const res = await fetch("/api/generate", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({
        error: `Request failed (${res.status} ${res.statusText})`,
      }))) as GenerateChunkResponse;
      if ("error" in json) throw new Error(json.error);
      if (run.current?.id !== ctx.id) return;

      const extras = ctx.brief.dimensions.filter((d) => d !== chunk.dimension);
      const replacedIds = new Set(
        json.ads.flatMap((ad) => [
          ad.id,
          ...extras.map((dimension) =>
            resizedAdId(chunk, ad.variation, dimension),
          ),
        ]),
      );
      setAds((prev) => [
        ...prev.filter((a) => !replacedIds.has(a.id)),
        ...json.ads,
      ]);

      const resizeFailures: string[] = [];
      await runPool(
        json.ads.flatMap((ad) =>
          extras.map((dimension) => async () => {
            try {
              const file = await dataUrlToFile(
                ad.imageUrl,
                `${ad.dimension}-${ad.variation}.png`,
              );
              const resizeForm = new FormData();
              resizeForm.append("brief", JSON.stringify(ctx.brief));
              resizeForm.append("options", JSON.stringify(ctx.options));
              resizeForm.append("dimension", dimension);
              resizeForm.append("image", file);
              const resizeRes = await fetch("/api/resize-ad", {
                method: "POST",
                body: resizeForm,
              });
              const resized = (await resizeRes.json().catch(() => ({
                error: `Resize failed (${resizeRes.status} ${resizeRes.statusText})`,
              }))) as
                | { imageUrl: string; prompt: string; failures: string[] }
                | { error: string };
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
              if (resized.failures.length > 0)
                resizeFailures.push(...resized.failures);
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
  function startNewAdSet() {
    setConfirmNewAdSet(false);
    for (const reference of references) URL.revokeObjectURL(reference.previewUrl);
    run.current = null;
    setStage("inputs");
    setReferenceSource("upload");
    setProductId(null);
    setProductPhotos({});
    setDimensions(["4x5"]);
    setCopyMode("separate");
    setCopy("");
    setProductVisibility("secondary");
    setTargetAds(4);
    setVariationsText("4");
    setLandingPages([]);
    setLandingUrl("");
    setLandingError(null);
    setGroups([
      { id: crypto.randomUUID(), name: "Reference group 1", description: "" },
    ]);
    setReferences([]);
    setError(null);
    setAds([]);
    setOpenAdId(null);
    setSelectedIds(new Set());
    setOriginals({});
    setShowingOriginal(new Set());
    setRegeneratingKeys(new Set());
    setRegenEditor(null);
    setRegenInstruction("");
    setRegenOthers(true);
    setRegenExtra(null);
    setRegenErrors({});
    setResultBatches([]);
    setChunks([]);
    setPreparing(false);
  }

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
      setOriginals({});
      setShowingOriginal(new Set());
      setRegeneratingKeys(new Set());
      setRegenEditor(null);
      setRegenInstruction("");
      setRegenOthers(true);
      setRegenExtra(null);
      setRegenErrors({});
      setSelectedIds(new Set());
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

  async function regenerateVariation(shown: GeneratedAd) {
    const ctx = run.current;
    const instruction = regenInstruction.trim();
    if (!ctx || !instruction) return;
    const key = variationKey(shown);
    const targetDimension = shown.dimension;
    const alsoOthers = regenOthers && ctx.brief.dimensions.length > 1;
    const loadingIds = (
      alsoOthers ? ctx.brief.dimensions : [targetDimension]
    ).map((dimension) => `${key}:${dimension}`);

    setRegeneratingKeys((prev) => {
      const next = new Set(prev);
      for (const id of loadingIds) next.add(id);
      return next;
    });
    setRegenEditor(null);
    setRegenErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const runId = ctx.id;
    try {
      const file = await dataUrlToFile(
        shown.imageUrl,
        `variation-${shown.variation}.png`,
      );
      const files: { name: string; file: File }[] = [{ name: "image", file }];
      for (const refId of [shown.styleRefId, shown.formatRefId]) {
        const reference = refId ? ctx.referenceFiles.get(refId) : undefined;
        if (refId && reference)
          files.push({ name: `reference:${refId}`, file: reference });
      }
      for (const [productId, productFile] of ctx.productFiles) {
        files.push({ name: `product:${productId}`, file: productFile });
      }
      if (regenExtra) files.push({ name: "extra", file: regenExtra });
      const generated = await postImageJob(
        "/api/regenerate-ad",
        {
          brief: JSON.stringify(ctx.brief),
          options: JSON.stringify(ctx.options),
          dimension: targetDimension,
          instruction,
          styleRefId: shown.styleRefId ?? "",
          formatRefId: shown.formatRefId ?? "",
        },
        files,
      );
      if ("error" in generated) throw new Error(generated.error);
      if (run.current?.id !== runId) return;

      const family = adsRef.current.filter(
        (item) => variationKey(item) === key,
      );
      const saved = alsoOthers
        ? family
        : family.filter((item) => item.dimension === targetDimension);
      setOriginals((prev) => {
        const next = { ...prev };
        for (const item of saved) {
          if (!next[item.id])
            next[item.id] = { imageUrl: item.imageUrl, prompt: item.prompt };
        }
        return next;
      });

      const sourceId = `${shown.batchId}-${shown.styleRefId ?? "none"}-${shown.formatRefId ?? "none"}-${targetDimension}-${shown.variation}`;
      const sourceAd: GeneratedAd = {
        ...(family.find((item) => item.id === sourceId) ?? shown),
        id: sourceId,
        batchId: shown.batchId,
        styleRefId: shown.styleRefId,
        formatRefId: shown.formatRefId,
        dimension: targetDimension,
        variation: shown.variation,
        imageUrl: generated.imageUrl,
        prompt: generated.prompt,
      };
      setAds((prev) => [
        ...prev.filter((item) => item.id !== sourceId),
        sourceAd,
      ]);

      const extras = alsoOthers
        ? ctx.brief.dimensions.filter(
            (dimension) => dimension !== targetDimension,
          )
        : [];
      const resizeFailures: string[] = [];
      await runPool(
        extras.map((dimension) => async () => {
          try {
            const resizeFile = await dataUrlToFile(
              generated.imageUrl,
              `${targetDimension}-${shown.variation}.png`,
            );
            const resized = await postImageJob(
              "/api/resize-ad",
              {
                brief: JSON.stringify(ctx.brief),
                options: JSON.stringify(ctx.options),
                dimension,
              },
              [{ name: "image", file: resizeFile }],
            );
            if ("error" in resized) throw new Error(resized.error);
            if (run.current?.id !== runId) return;
            const nextAd: GeneratedAd = {
              ...sourceAd,
              id: `${shown.batchId}-${shown.styleRefId ?? "none"}-${shown.formatRefId ?? "none"}-${dimension}-${shown.variation}`,
              dimension,
              imageUrl: resized.imageUrl,
              prompt: resized.prompt,
            };
            setAds((prev) => [
              ...prev.filter((item) => item.id !== nextAd.id),
              nextAd,
            ]);
          } catch (err) {
            resizeFailures.push(
              err instanceof Error
                ? `${dimension}: ${err.message}`
                : `Could not resize to ${dimension}`,
            );
          }
        }),
        2,
      );
      if (run.current?.id !== runId) return;
      setShowingOriginal((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      if (resizeFailures.length > 0) {
        setRegenErrors((prev) => ({
          ...prev,
          [key]: resizeFailures.join("; "),
        }));
      }
    } catch (err) {
      if (run.current?.id !== runId) return;
      setRegenErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Regeneration failed",
      }));
    } finally {
      if (run.current?.id === runId) {
        setRegeneratingKeys((prev) => {
          const next = new Set(prev);
          for (const id of loadingIds) next.delete(id);
          return next;
        });
      }
    }
  }

  function adIsSelected(ad: GeneratedAd) {
    return selectedIds.has(ad.id);
  }

  function toggleAd(ad: GeneratedAd) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ad.id)) next.delete(ad.id);
      else next.add(ad.id);
      return next;
    });
  }

  async function downloadAds(list: GeneratedAd[], folder: string) {
    if (list.length === 0) return;
    if (list.length === 1) {
      saveDownload(list[0].imageUrl, fileNameFor(list[0]));
      return;
    }
    const used = new Map<string, number>();
    const named = list.map((ad) => ({
      ad,
      name: uniqueDownloadName(fileNameFor(ad), used),
    }));
    const files = await Promise.all(
      named.map(async ({ ad, name }) => {
        const response = await fetch(ad.imageUrl);
        return { name, bytes: new Uint8Array(await response.arrayBuffer()) };
      }),
    );
    const safeFolder = folder.replace(/[\\/:*?"<>|]+/g, " ").trim() || "ads";
    const zip = zipFolder(safeFolder, files);
    const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
    saveDownload(url, `${safeFolder}.zip`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          dimensionOrder.indexOf(a.dimension) -
            dimensionOrder.indexOf(b.dimension),
      );
  const displayAd = (ad: GeneratedAd): GeneratedAd => {
    if (!showingOriginal.has(variationKey(ad))) return ad;
    const saved = originals[ad.id];
    return saved
      ? { ...ad, imageUrl: saved.imageUrl, prompt: saved.prompt }
      : ad;
  };
  const galleryAds = resultBatches.flatMap((b) =>
    adsInGroup(b.id).map(displayAd),
  );
  const groupNames = Object.fromEntries(
    resultBatches.map((b) => [b.id, batchLabel(b)]),
  );

  return (
    <div>
      <ProgressBar stage={stage} onSelect={setStage} />

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
                            if (prev.includes(d)) return prev.filter((x) => x !== d);
                            return DIMENSIONS.filter(
                              (x) => x === d || prev.includes(x),
                            );
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
                <span
                  className={`font-normal ${dimensions.length === 0 ? "text-rose-600" : "text-zinc-400"}`}
                >
                  {dimensions.length === 0
                    ? "Choose at least one size before continuing."
                    : dimensions.length > 1
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
                <span>Variations per reference</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={variationsText}
                  aria-invalid={variationsOutOfRange}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw !== "" && !/^\d+$/.test(raw)) return;
                    setVariationsText(raw);
                    const next = Number(raw);
                    if (
                      raw !== "" &&
                      next >= MIN_VARIATIONS_PER_REFERENCE &&
                      next <= MAX_VARIATIONS_PER_REFERENCE
                    ) {
                      setTargetAds(next);
                    }
                  }}
                  className={
                    variationsOutOfRange
                      ? "!border-rose-500 !text-rose-600 focus:!border-rose-500"
                      : undefined
                  }
                />
                <span
                  className={
                    variationsOutOfRange
                      ? "font-normal text-rose-600"
                      : "font-normal text-zinc-400"
                  }
                >
                  {variationsOutOfRange
                    ? `Enter a number from ${MIN_VARIATIONS_PER_REFERENCE} to ${MAX_VARIATIONS_PER_REFERENCE}.`
                    : `Type a number from ${MIN_VARIATIONS_PER_REFERENCE} to ${MAX_VARIATIONS_PER_REFERENCE}. Each reference image generates this many variations.`}
                </span>
              </label>

              <div className="col-span-2 grid grid-cols-2 gap-4">
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
                {copyMode === "in-image" && (
                  <>
                    <label className="field col-span-2">
                      <span>Ad copy</span>
                      <textarea
                        rows={2}
                        value={copy}
                        onChange={(e) => setCopy(e.target.value)}
                      />
                    </label>
                    <div className="field col-span-2">
                      <span>Landing page link (optional)</span>
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void addLandingPage(landingUrl);
                        }}
                      >
                        <input
                          type="text"
                          inputMode="url"
                          value={landingUrl}
                          onChange={(e) => setLandingUrl(e.target.value)}
                          placeholder={brand.website}
                          aria-label="Landing page link"
                          className="min-w-0 flex-1"
                        />
                        <button
                          type="submit"
                          disabled={landingLoading || !landingUrl.trim()}
                          className="btn-secondary shrink-0"
                        >
                          {landingLoading ? "Reading…" : "Add"}
                        </button>
                      </form>
                      <span
                        className={
                          landingError
                            ? "font-normal text-rose-600"
                            : "font-normal text-zinc-400"
                        }
                      >
                        {landingError ??
                          "Paste a link. We read the title, description, headings, and page copy."}
                      </span>
                      {landingPages.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {landingPages.map((lp, i) => (
                            <span
                              key={`${lp.fileName}-${i}`}
                              title={[
                                lp.fileName,
                                lp.description,
                                ...lp.headings,
                              ]
                                .filter(Boolean)
                                .join("\n")}
                              className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-normal text-zinc-800"
                            >
                              <span className="max-w-64 truncate">
                                {lp.title}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setLandingPages((prev) =>
                                    prev.filter((_, j) => j !== i),
                                  )
                                }
                                className="text-zinc-400 hover:text-rose-600"
                                aria-label={`Remove ${lp.title}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {SHOW_CREATIVE_BREAKDOWN && (
              <CreativeBreakdownPanel
                title="Creative breakdown (Step 1 test)"
                json={stepOneJson}
                data={stepOneBreakdown}
                brandName={brand.name}
              />
            )}
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
        <ReferenceCart
          open={cartOpen}
          onOpen={() => setCartOpen(true)}
          onClose={() => setCartOpen(false)}
          brandColor={brand.color}
          groups={groups}
          references={references.map((r) => ({
            id: r.id,
            groupId: r.groupId,
            role: r.role,
            previewUrl: r.previewUrl,
            label: r.sourcedFrom ?? r.file.name,
          }))}
          adCountFor={(groupId) =>
            (batches.find((b) => b.id === groupId)?.count ?? 0) * dimensions.length
          }
          onRenameGroup={renameGroup}
          onDescribeGroup={setGroupDescription}
          onRemoveGroup={removeGroup}
          onAddGroup={addGroup}
          onRemoveReference={removeReference}
          canAddGroup={groupIds.length < MAX_REFERENCE_GROUPS}
          onReview={
            referenceSource === "library" ? () => setStage("review") : undefined
          }
          canReview={canReview}
          reviewStatus={
            referenceSource === "library"
              ? referencesMissing.length > 0
                ? `Still needed: ${referencesMissing.join(", ")}`
                : totalAds > MAX_TOTAL_ADS
                  ? `${totalAds} ads is over the ${MAX_TOTAL_ADS} ad limit for one run.`
                  : `${totalAds} ads (${dimensions.join(", ")}) across ${batches.length} reference group${batches.length === 1 ? "" : "s"}`
              : undefined
          }
          onBack={
            referenceSource === "library" ? () => setStage("inputs") : undefined
          }
        />
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
              suggestedQuery={brief.keywords.join(", ")}
              groupNames={groups.map((g) => g.name)}
              addedTo={libraryUsage}
              onAdd={addLibraryAds}
              onRemove={removeLibraryAd}
            />
          )}

          {referenceSource !== "library" && (
          <section className="card">
            <h2 className="section-title mb-1">References *</h2>
            <p className="mb-5 text-sm text-zinc-500">
              Each generation uses one style reference and one format
              reference. A single image can cover both. If you add more, they
              pair in order and the shorter list is reused. Each pair gets the
              number of variations you set.
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
                          aria-label={`Name for reference group ${groupIndex + 1}`}
                          placeholder={`Reference group ${groupIndex + 1}`}
                          className="min-w-0 max-w-sm rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-zinc-900 outline-none hover:border-zinc-300 focus:border-brand focus:bg-white"
                        />
                        {batch && (
                          <span className="shrink-0 text-sm font-normal text-zinc-400">
                            · {batch.count * dimensions.length} ads
                          </span>
                        )}
                      </div>
                      {groupIds.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeGroup(groupId)}
                          className="px-1 text-2xl leading-none text-zinc-400 hover:text-rose-600"
                          aria-label="Remove reference group"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    <label className="field mb-4">
                      <span>Description</span>
                      <textarea
                        rows={3}
                        value={groups[groupIndex].description}
                        onChange={(e) =>
                          setGroupDescription(groupId, e.target.value)
                        }
                        placeholder="Write the description for this reference group"
                        aria-label={`Description for ${groups[groupIndex].name.trim() || `reference group ${groupIndex + 1}`}`}
                      />
                      <span className="font-normal text-zinc-400">
                        Separate more than one with a semicolon.
                      </span>
                    </label>

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
                            onReference={(id) =>
                              moveReference(id, groupId, role)
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
                                  onDropReference={(id) =>
                                    moveReference(id, groupId, role, r.id)
                                  }
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
                  <span className="text-xl leading-none">+</span> Add reference
                  group
                </button>
              )}
            </div>

          </section>
          )}

          {SHOW_CREATIVE_BREAKDOWN && (
            <CreativeBreakdownPanel
              title="Creative breakdown (Step 2 test)"
              json={stepTwoJson}
              data={stepTwoBreakdown}
              brandName={brand.name}
            />
          )}

          {referenceSource !== "library" && (
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
                  : `${totalAds} ads (${dimensions.join(", ")}) across ${batches.length} reference group${batches.length === 1 ? "" : "s"}`}
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
          )}
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
              <dt className="text-zinc-500">Copy</dt>
              <dd>
                {copyMode === "separate" ? "Separate" : `In image: "${copy}"`}
              </dd>
              <dt className="text-zinc-500">Landing pages</dt>
              <dd>
                {brief.landingPages.map((lp) => lp.title).join(", ") || "None"}
              </dd>
              <dt className="text-zinc-500">Variations</dt>
              <dd>
                {targetAds} per reference · {totalAds} ads across{" "}
                {batches.length} reference group
                {batches.length === 1 ? "" : "s"}
              </dd>
            </dl>

            <div className="mt-6 flex flex-col gap-3">
              {batches.map((b) => (
                <div key={b.id} className="rounded-lg bg-zinc-50 p-3 text-sm">
                  <p className="font-medium">
                    {batchLabel(b)}{" "}
                    <span className="font-normal text-zinc-500">
                      · {b.count} ads
                    </span>
                  </p>
                  <p className="mb-2 text-zinc-500">
                    Keywords:{" "}
                    {groups.find((g) => g.id === b.id)?.description.trim() ||
                      "None"}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {b.jobs.map((j) => {
                      const coversBoth =
                        !!j.style && !!j.format && j.style.id === j.format.id;
                      const shown = coversBoth
                        ? [j.style]
                        : [j.style, j.format].filter((ref) => ref !== null);
                      return (
                      <div
                        key={`${j.style?.id}-${j.format?.id}`}
                        className="flex items-center gap-2"
                      >
                        {shown.map(
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
                          {coversBoth
                            ? `style and layout ${j.style?.fileName}`
                            : `${j.style ? `style ${j.style.fileName}` : "new style"} × ${
                                j.format
                                  ? `format ${j.format.fileName}`
                                  : "new layout"
                              }`}
                        </span>
                        <span className="text-zinc-500">{j.count} ads</span>
                        {shown.map(
                          (ref) =>
                            ref && (
                              <ScoreBadge key={ref.id} metrics={ref.metrics} />
                            ),
                        )}
                      </div>
                      );
                    })}
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
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
              {ads.length} of{" "}
              {chunks.reduce((sum, c) => sum + c.count, 0) *
                Math.max(dimensionOrder.length, 1)}{" "}
              ads generated with{" "}
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
            <button
              type="button"
              onClick={() => setConfirmNewAdSet(true)}
              className="btn-secondary shrink-0"
            >
              Start New Ad Set
            </button>
          </div>

          {resultBatches.map((b) => {
            const groupChunks = chunks.filter((c) => c.groupId === b.id);
            const groupAds = adsInGroup(b.id);
            const groupSelected = groupAds.filter((ad) => adIsSelected(ad));
            const groupAllSelected = groupSelected.length === groupAds.length;
            const done = groupChunks.filter((c) => c.status === "done").length;
            const columnCount = groupChunks.reduce(
              (sum, c) => sum + c.count,
              0,
            );
            return (
              <section key={b.id} className="card min-w-0">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="section-title mb-0">
                    {batchLabel(b)}{" "}
                    <span className="text-sm font-normal text-zinc-500">
                      · {done}/{groupChunks.length} requests done
                    </span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => void downloadAds(groupSelected, batchLabel(b))}
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
                          {c.status === "error"
                            ? c.error
                            : c.failures!.join("; ")}
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
                <div className="w-full min-w-0 overflow-x-auto">
                  <div className="flex w-max min-w-full flex-col gap-8">
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
                          <p className="mb-2 text-sm font-semibold text-zinc-800">
                            {dimension}
                          </p>
                          <div
                            className="grid w-max min-w-full gap-4 px-4"
                            style={{
                              gridTemplateColumns: `repeat(${Math.max(columnCount, 1)}, minmax(0, 12rem))`,
                            }}
                          >
                            {columns.map(({ key, chunk, variation }) => {
                              const vKey = variationKey({
                                batchId: chunk.groupId,
                                styleRefId: chunk.styleRefId,
                                formatRefId: chunk.formatRefId,
                                variation,
                              });
                              const ad = groupAds.find(
                                (item) =>
                                  item.styleRefId === chunk.styleRefId &&
                                  item.formatRefId === chunk.formatRefId &&
                                  item.dimension === dimension &&
                                  item.variation === variation,
                              );
                              if (ad) {
                                const shown = displayAd(ad);
                                const busy = regeneratingKeys.has(
                                  `${vKey}:${ad.dimension}`,
                                );
                                return (
                                  <ResultFigure
                                    key={ad.id}
                                    ad={shown}
                                    selected={adIsSelected(ad)}
                                    downloadName={fileNameFor(shown)}
                                    loading={busy}
                                    onOpen={() => setOpenAdId(ad.id)}
                                    onToggle={() => toggleAd(ad)}
                                    regenerate={{
                                      error: regenErrors[vKey],
                                      hasOriginal: Boolean(originals[ad.id]),
                                      showingOriginal:
                                        showingOriginal.has(vKey),
                                      onOpenForm: () => {
                                        setRegenEditor({
                                          key: vKey,
                                          dimension: ad.dimension,
                                          imageUrl: shown.imageUrl,
                                          variation: shown.variation,
                                        });
                                        setRegenInstruction("");
                                        setRegenOthers(true);
                                        setRegenExtra(null);
                                      },
                                      onToggleOriginal: () =>
                                        setShowingOriginal((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(vKey)) next.delete(vKey);
                                          else next.add(vKey);
                                          return next;
                                        }),
                                    }}
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
                                chunk.status === "pending" ||
                                chunk.status === "running";
                              const label = regeneratingKeys.has(
                                `${vKey}:${dimension}`,
                              )
                                ? "Regenerating…"
                                : dimension === chunk.dimension
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
                                <div
                                  key={key}
                                  className="flex w-full min-w-0 flex-col gap-1"
                                >
                                  <p className="text-left text-xs font-semibold text-zinc-800">
                                    #{variation}
                                  </p>
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
          {confirmNewAdSet && (
            <StartNewAdSetDialog
              onCancel={() => setConfirmNewAdSet(false)}
              onConfirm={startNewAdSet}
            />
          )}
          {regenEditor && (
            <RegenerateDialog
              imageUrl={regenEditor.imageUrl}
              variation={regenEditor.variation}
              dimension={regenEditor.dimension}
              instruction={regenInstruction}
              showOthers={dimensionOrder.length > 1}
              alsoOthers={regenOthers}
              onInstruction={setRegenInstruction}
              onAlsoOthers={setRegenOthers}
              onExtra={setRegenExtra}
              onCancel={() => setRegenEditor(null)}
              onSubmit={() => {
                const ad = ads.find(
                  (item) =>
                    variationKey(item) === regenEditor.key &&
                    item.dimension === regenEditor.dimension,
                );
                if (!ad) return;
                void regenerateVariation({
                  ...displayAd(ad),
                  imageUrl: regenEditor.imageUrl,
                });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
