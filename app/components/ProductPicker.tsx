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
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[10px] text-zinc-400">
        No photo
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- local blob or static preview
  return (
    <img
      src={src}
      alt={product.name}
      className="h-14 w-14 shrink-0 rounded-lg bg-zinc-100 object-cover"
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
  const selected = products.filter((p) => p.id === selectedId);
  const groups = Map.groupBy(products, (p) => p.category ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div className="field">
        <span>Product *</span>
        <div className="flex flex-col gap-3">
          {Array.from(groups, ([category, items]) => (
            <div key={category} className="flex flex-col gap-1.5">
              {category && (
                <span className="font-normal text-zinc-400">{category}</span>
              )}
              <div className="flex flex-wrap gap-2">
                {items.map((p) => {
                  const checked = p.id === selectedId;
                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-normal ${
                        checked
                          ? "border-brand bg-brand/5 text-zinc-900"
                          : "border-zinc-300 text-zinc-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name={radioName}
                        checked={checked}
                        onChange={() => onSelect(p.id)}
                        className="accent-brand"
                      />
                      {p.name}
                      <span className="font-mono text-xs text-zinc-400">
                        {p.sku}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
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

      {visibility === "secondary" && selected.length > 0 && (
        <div className="flex flex-col gap-2">
          {selected.map((p) => (
            <div key={p.id} className="flex items-center gap-3 text-sm">
              <ProductPhoto product={p} file={photos[p.id]} />
              <span className="flex-1">{p.name}</span>
              <label className="cursor-pointer text-xs text-zinc-600 underline hover:text-zinc-900">
                {photos[p.id] || p.image ? "Replace photo" : "Upload photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    onPhotoChange(p.id, e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
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
    </div>
  );
}
