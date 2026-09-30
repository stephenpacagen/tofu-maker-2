"use client";

import { useState } from "react";
import { REFERENCE_DRAG_TYPE } from "./DropZone";
import { scoreReference } from "@/lib/references/score";
import type { ReferenceMetrics, ReferenceRole } from "@/lib/types";

export type ReferenceDraft = {
  id: string;
  groupId: string;
  file: File;
  previewUrl: string;
  role: ReferenceRole;
  prompt: string;
  metrics: ReferenceMetrics;
  source: "upload" | "sourced";
  libraryAdId?: string;
  sourcedFrom?: string;
};

const TIER_STYLES = {
  strong: "bg-emerald-100 text-emerald-800",
  promising: "bg-amber-100 text-amber-800",
  weak: "bg-rose-100 text-rose-800",
  unknown: "bg-zinc-100 text-zinc-600",
};

const parseOptionalNumber = (value: string) => (value === "" ? undefined : Math.max(0, Number(value)));

export function ScoreBadge({ metrics }: { metrics: ReferenceMetrics }) {
  const { score, tier, breakdown } = scoreReference(metrics);
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TIER_STYLES[tier]}`}
      title={breakdown.map((b) => `${b.label}: +${b.contribution}`).join("\n")}
    >
      {score === null ? "No metrics" : `Score ${score} · ${tier}`}
    </span>
  );
}

export function ReferenceCard({
  reference,
  usage,
  onChange,
  onRemove,
  onDropReference,
}: {
  reference: ReferenceDraft;
  usage: string;
  onChange: (next: ReferenceDraft) => void;
  onRemove: () => void;
  /** Move another reference to this spot. */
  onDropReference?: (id: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const setMetric = <K extends keyof ReferenceMetrics>(key: K, value: ReferenceMetrics[K]) =>
    onChange({ ...reference, metrics: { ...reference.metrics, [key]: value } });

  return (
    <div
      draggable
      title="Drag to move"
      className={`flex cursor-grab gap-3 rounded-xl border bg-white p-3 outline-none active:cursor-grabbing [&_button]:cursor-pointer [&_input]:cursor-text [&_select]:cursor-pointer [&_summary]:cursor-pointer ${
        dropTarget ? "border-brand" : "border-zinc-200"
      } ${dragging ? "opacity-50" : ""}`}
      onDragStart={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("input, textarea, select, button, summary, a")) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData(REFERENCE_DRAG_TYPE, reference.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => {
        if (!onDropReference || !Array.from(e.dataTransfer.types).includes(REFERENCE_DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(REFERENCE_DRAG_TYPE);
        if (!id || id === reference.id || !onDropReference) return;
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(false);
        onDropReference(id);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
      <img
        src={reference.previewUrl}
        alt={reference.file.name}
        draggable={false}
        className="h-32 w-24 shrink-0 rounded-lg bg-zinc-100 object-cover"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium" title={reference.file.name}>
            {reference.sourcedFrom ?? reference.file.name}
          </p>
          <button type="button" onClick={onRemove} className="shrink-0 text-xs text-zinc-500 hover:text-rose-600">
            Remove
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{usage}</span>
          {reference.sourcedFrom && (
            <span className="rounded-md bg-brand/5 px-2 py-0.5 text-xs text-brand">From library</span>
          )}
          <ScoreBadge metrics={reference.metrics} />
        </div>

        <label className="field">
          <span>Prompt</span>
          <input
            placeholder="please specify here"
            value={reference.prompt}
            onChange={(e) => onChange({ ...reference, prompt: e.target.value })}
          />
        </label>

        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-zinc-600">Performance metrics</summary>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <label className="field">
              <span>Run days</span>
              <input
                type="number"
                min={0}
                value={reference.metrics.runDays ?? ""}
                onChange={(e) => setMetric("runDays", parseOptionalNumber(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Active</span>
              <select
                value={reference.metrics.isActive === undefined ? "" : String(reference.metrics.isActive)}
                onChange={(e) =>
                  setMetric("isActive", e.target.value === "" ? undefined : e.target.value === "true")
                }
              >
                <option value="">?</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label className="field">
              <span>Duplicates</span>
              <input
                type="number"
                min={0}
                value={reference.metrics.duplicateCount ?? ""}
                onChange={(e) => setMetric("duplicateCount", parseOptionalNumber(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Platforms</span>
              <input
                type="number"
                min={0}
                value={reference.metrics.platformCount ?? ""}
                onChange={(e) => setMetric("platformCount", parseOptionalNumber(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Engagement</span>
              <input
                type="number"
                min={0}
                value={reference.metrics.engagement ?? ""}
                onChange={(e) => setMetric("engagement", parseOptionalNumber(e.target.value))}
              />
            </label>
          </div>
        </details>
      </div>
    </div>
  );
}
