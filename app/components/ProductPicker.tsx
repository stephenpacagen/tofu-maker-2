"use client";

import { useEffect, useMemo } from "react";
import type { Product } from "@/lib/brands";
import type { ProductVisibility } from "@/lib/types";

const VISIBILITY_OPTIONS: { value: ProductVisibility; label: string }[] = [
  { value: "secondary", label: "Product" },
  { value: "none", label: "No product" },
];

function ProductPhoto({ product, file }: { product: Product; file?: File }) {
  const uploadedUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(
    () => () => void (uploadedUrl && URL.revokeObjectURL(uploadedUrl)),
    [uploadedUrl],
  );

  const src = uploadedUrl ?? product.image;
  if (!src) {
    return (
      <div className="flex h-48 w-48 max-w-full items-center justify-center bg-zinc-100 text-xs text-zinc-400">
        No photo
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- local blob or static preview
  return (
    <img
      src={src}
      alt={product.name}
      className="h-48 w-48 max-w-full bg-zinc-100 object-contain"
    />
  );
}

export function ProductPicker({
  products,
  selectedId,
  radioName,
  onSelect,
  visibility,
  onVisibilityChange,
  photos,
  onPhotoChange,
}: {
  products: Product[];
  selectedId: string | null;
  radioName: string;
  onSelect: (id: string) => void;
  visibility: ProductVisibility;
  onVisibilityChange: (visibility: ProductVisibility) => void;
  photos: Record<string, File>;
  onPhotoChange: (id: string, file: File | null) => void;
}) {
  const picked = products.find((p) => p.id === selectedId);
  const selected = picked
    ? picked.bundleOf
      ? products.filter((p) => picked.bundleOf?.includes(p.id))
      : [picked]
    : [];
  const groups = Map.groupBy(products, (p) => p.category ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-zinc-900">
          Product <span className="text-rose-600">*</span>
        </span>
        <span className="text-xs font-normal text-zinc-400">Select one</span>
      </div>

      <div className="field">
        <span>Product in the ad</span>
        <div
          role="radiogroup"
          className="flex w-fit rounded-lg border border-zinc-300 p-0.5"
        >
          {VISIBILITY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={visibility === o.value}
              onClick={() => onVisibilityChange(o.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-normal ${
                visibility === o.value
                  ? "bg-brand text-white"
                  : "text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {selected.length === 0 ? (
        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-2 text-sm">
            <div className="h-48 w-48 max-w-full rounded-xl bg-zinc-100" />
            <span>No product selected</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-center gap-4">
          {selected.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-2 text-sm">
              <label className="group relative block cursor-pointer overflow-hidden rounded-xl focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2">
                <ProductPhoto product={p} file={photos[p.id]} />
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  {photos[p.id] || p.image ? "Replace photo" : "Upload photo"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label={`Replace photo for ${p.name}`}
                  onChange={(e) => {
                    onPhotoChange(p.id, e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              <span>{p.name}</span>
              {photos[p.id] && (
                <button
                  type="button"
                  onClick={() => onPhotoChange(p.id, null)}
                  className="text-xs text-zinc-500 hover:text-rose-600"
                >
                  Clear
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {Array.from(groups, ([category, items]) => (
          <div key={category} className="flex flex-col gap-1.5">
            {category && (
              <span className="text-[13px] font-normal text-zinc-500">
                {category}
              </span>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {items.map((p) => {
                const checked = p.id === selectedId;
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                      p.bundleOf ? "sm:col-span-2" : ""
                    } ${
                      checked
                        ? "border-brand bg-brand/5"
                        : "border-zinc-300 bg-white hover:border-zinc-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name={radioName}
                      checked={checked}
                      onChange={() => onSelect(p.id)}
                      className="size-4 shrink-0 accent-brand"
                    />
                    <span className="min-w-0 text-sm leading-snug font-medium text-zinc-900">
                      {p.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
