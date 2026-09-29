"use client";

import { useEffect, useState } from "react";
import { BRANDS } from "@/lib/brands";
import { AdGenerator } from "./AdGenerator";

export function BrandTabs() {
  const [activeId, setActiveId] = useState(BRANDS[0].id);

  // A file dropped outside a drop zone would otherwise navigate away and wipe the form.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Ad Generator</h1>
        <p className="text-sm text-zinc-500">Reference-based static ad generation</p>
      </header>

      <div role="tablist" className="mb-8 flex gap-1 border-b border-zinc-200">
        {BRANDS.map((brand) => (
          <button
            key={brand.id}
            role="tab"
            type="button"
            aria-selected={brand.id === activeId}
            onClick={() => setActiveId(brand.id)}
            style={brand.id === activeId ? { borderColor: brand.color, color: brand.color } : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              brand.id === activeId ? "" : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {brand.name}
          </button>
        ))}
      </div>

      {/* Inactive tabs stay mounted so each brand keeps its own in-progress work. */}
      {BRANDS.map((brand) => (
        <div
          key={brand.id}
          role="tabpanel"
          hidden={brand.id !== activeId}
          style={{ "--brand": brand.color } as React.CSSProperties}
        >
          <AdGenerator brand={brand} />
        </div>
      ))}
    </div>
  );
}
