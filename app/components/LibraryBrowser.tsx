"use client";

import { useEffect, useRef, useState } from "react";
import {
  LIBRARY_PLATFORMS,
  LIBRARY_SORTS,
  normalizeName,
  PLATFORM_LABELS,
  PLATFORMS_BY_SOURCE,
  type LibraryBrand,
  type LibraryPage,
  type LibrarySort,
  type LibrarySource,
  type RankedLibraryAd,
} from "@/lib/references/library";
import { REFERENCE_ROLE_LABELS, REFERENCE_ROLES, type ReferenceRole } from "@/lib/types";
import { ScoreBadge } from "./ReferenceCard";

type SearchMode = "keyword" | "brand";

type Filters = { platform: string; sort: LibrarySort; liveOnly: boolean; minRunDays: number };

const INLINE_CONTROL = "rounded-lg border border-zinc-300 bg-white py-1.5 text-sm outline-none focus:border-brand";
const INLINE_SELECT = `${INLINE_CONTROL} pr-10 pl-3`;
const INLINE_INPUT = `${INLINE_CONTROL} px-2`;

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] tracking-wide text-zinc-400 uppercase">{label}</dt>
      <dd className="text-xs font-medium text-zinc-800">{value}</dd>
    </div>
  );
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

export function LibraryBrowser({
  suggestedQuery,
  groupNames,
  addedTo,
  onAdd,
  onRemove,
}: {
  suggestedQuery: string;
  groupNames: string[];
  addedTo: (adId: string) => { groupIndex: number; role: ReferenceRole }[];
  onAdd: (ads: RankedLibraryAd[], groupIndex: number, role: ReferenceRole) => Promise<void>;
  onRemove: (adId: string, groupIndex: number, role: ReferenceRole) => void;
}) {
  const [mode, setMode] = useState<SearchMode>("keyword");
  const [q, setQ] = useState(suggestedQuery);
  const appliedSuggestion = useRef(suggestedQuery);
  useEffect(() => {
    setQ((current) =>
      current.trim() === "" || current === appliedSuggestion.current ? suggestedQuery : current,
    );
    appliedSuggestion.current = suggestedQuery;
  }, [suggestedQuery]);
  const [brandQuery, setBrandQuery] = useState("");
  const [brands, setBrands] = useState<LibraryBrand[] | null>(null);
  const [brand, setBrand] = useState<LibraryBrand | null>(null);
  const [filters, setFilters] = useState<Filters>({
    platform: "",
    sort: "score",
    liveOnly: true,
    minRunDays: 30,
  });
  const { platform, sort, liveOnly, minRunDays } = filters;
  const latestRequest = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [ads, setAds] = useState<RankedLibraryAd[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [source, setSource] = useState<LibrarySource | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<RankedLibraryAd[]>([]);
  const [groupIndex, setGroupIndex] = useState(0);
  const [role, setRole] = useState<ReferenceRole>("format");
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<string[]>([]);

  const groupCount = groupNames.length;
  const groupLabel = (i: number) => groupNames[i]?.trim() || `Reference group ${i + 1}`;
  const targetGroup = Math.min(groupIndex, groupCount - 1);
  const seenGroupCount = useRef(groupCount);
  // A new group is the one you just asked for, so the next library add goes there.
  useEffect(() => {
    if (groupCount > seenGroupCount.current) setGroupIndex(groupCount - 1);
    seenGroupCount.current = groupCount;
  }, [groupCount]);

  async function loadAds({
    brandId,
    more = false,
    using = filters,
  }: { brandId?: string; more?: boolean; using?: Filters } = {}) {
    const params = new URLSearchParams({
      platform: using.platform,
      sort: using.sort,
      liveOnly: String(using.liveOnly),
      minRunDays: String(using.minRunDays),
    });
    if (brandId) params.set("brandId", brandId);
    else params.set("q", q);
    if (more && cursor) params.set("cursor", cursor);

    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const page = await getJson<LibraryPage>(`/api/library?${params}`);
      if (requestId !== latestRequest.current) return;
      setAds((prev) =>
        more && prev ? [...prev, ...page.ads.filter((ad) => !prev.some((p) => p.id === ad.id))] : page.ads,
      );
      setCursor(page.cursor);
      setSource(page.source);
      setTotal(page.total);
    } catch (e) {
      if (requestId === latestRequest.current) setError(e instanceof Error ? e.message : "Could not load the library");
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }

  function updateFilters(patch: Partial<Filters>, delayMs = 0) {
    const next = { ...filters, ...patch };
    setFilters(next);
    clearTimeout(refreshTimer.current);
    const hasResults = ads !== null && (mode === "keyword" || brand);
    if (!hasResults) return;
    refreshTimer.current = setTimeout(() => void loadAds({ brandId: activeBrandId, using: next }), delayMs);
  }

  async function findBrands() {
    setLoading(true);
    setError(null);
    try {
      const { brands } = await getJson<{ brands: LibraryBrand[] }>(
        `/api/library/brands?${new URLSearchParams({ q: brandQuery })}`,
      );
      setBrands(brands);
      const exact = brands.find((b) => normalizeName(b.name) === normalizeName(brandQuery));
      if (exact) {
        setBrand(exact);
        await loadAds({ brandId: exact.id });
      } else {
        setBrand(null);
        setAds(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Brand search failed");
    } finally {
      setLoading(false);
    }
  }

  function pickBrand(b: LibraryBrand) {
    setBrand(b);
    void loadAds({ brandId: b.id });
  }

  const isSelected = (id: string) => selected.some((ad) => ad.id === id);
  const toggle = (ad: RankedLibraryAd) =>
    setSelected((prev) => (isSelected(ad.id) ? prev.filter((x) => x.id !== ad.id) : [...prev, ad]));

  async function add() {
    setAdding(true);
    try {
      await onAdd(selected, targetGroup, role);
      setSelected([]);
    } finally {
      setAdding(false);
    }
  }

  async function toggleQuickAdd(ad: RankedLibraryAd, quickRole: ReferenceRole, isAdded: boolean) {
    if (isAdded) return onRemove(ad.id, targetGroup, quickRole);
    const key = `${ad.id}:${quickRole}`;
    setPending((prev) => [...prev, key]);
    try {
      await onAdd([ad], targetGroup, quickRole);
    } finally {
      setPending((prev) => prev.filter((k) => k !== key));
    }
  }

  const activeBrandId = mode === "brand" ? brand?.id : undefined;

  return (
    <section className="card">
      <h2 className="section-title mb-0">Reference library</h2>
      <p className="mb-5 text-sm text-zinc-500">
        Static ads from other brands, ranked by public signals like run time, active status, and platform reach (not
        CTR or CVR). Select the ones you want and add them to a group.
      </p>

      <div className="mb-4 flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm" role="tablist">
        {(["keyword", "brand"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-3 py-1.5 ${mode === m ? "bg-white font-medium shadow-sm" : "text-zinc-500"}`}
          >
            {m === "keyword" ? "Search by keyword" : "Browse a brand"}
          </button>
        ))}
      </div>

      {mode === "keyword" ? (
        <form
          className="mb-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void loadAds();
          }}
        >
          <label className="field flex-1">
            <span>Keywords</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="allergy relief, gut health, pets…" />
          </label>
          <button type="submit" disabled={loading} className="btn-primary">
            Search
          </button>
        </form>
      ) : (
        <div className="mb-4 flex flex-col gap-3">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (brandQuery.trim()) void findBrands();
            }}
          >
            <label className="field flex-1">
              <span>Brand name</span>
              <input value={brandQuery} onChange={(e) => setBrandQuery(e.target.value)} placeholder="Grüns, AG1, Olipop…" />
            </label>
            <button type="submit" disabled={loading || !brandQuery.trim()} className="btn-primary">
              Find brand
            </button>
          </form>
          {brands && brands.length === 0 && <p className="text-sm text-zinc-500">No brands found.</p>}
          {brands && brands.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {brands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => pickBrand(b)}
                  title={liveOnly && b.activeAdsCount === 0 ? "No running ads; turn off “Still running” to see past ads" : undefined}
                  className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm ${
                    brand?.id === b.id ? "border-brand bg-brand/5" : "border-zinc-200 hover:border-zinc-400"
                  } ${liveOnly && b.activeAdsCount === 0 ? "opacity-50" : ""}`}
                >
                  {b.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote brand avatar
                    <img src={b.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <span className="h-6 w-6 rounded-full bg-zinc-200" />
                  )}
                  <span className="font-medium">{b.name}</span>
                  <span className="text-xs text-zinc-500">{b.activeAdsCount.toLocaleString()} active</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <select className={INLINE_SELECT} value={platform} onChange={(e) => updateFilters({ platform: e.target.value })}>
          <option value="">All platforms</option>
          {(source ? PLATFORMS_BY_SOURCE[source] : LIBRARY_PLATFORMS).map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
        <select
          className={INLINE_SELECT}
          value={sort}
          onChange={(e) => updateFilters({ sort: e.target.value as LibrarySort })}
        >
          {Object.entries(LIBRARY_SORTS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-zinc-600">
          Running at least
          <input
            type="number"
            min={0}
            value={minRunDays}
            onChange={(e) => updateFilters({ minRunDays: Math.max(0, Math.floor(Number(e.target.value)) || 0) }, 600)}
            className={`${INLINE_INPUT} w-16`}
          />
          days
        </label>
        <label className="flex items-center gap-1.5 text-zinc-600">
          <input
            type="checkbox"
            checked={liveOnly}
            onChange={(e) => updateFilters({ liveOnly: e.target.checked })}
            className="accent-brand"
          />
          Still running
        </label>
        {ads && (
          <span className="ml-auto text-xs text-zinc-500">
            {loading
              ? "Updating…"
              : total !== null
                ? `Showing ${ads.length} of ${total} ad${total === 1 ? "" : "s"}`
                : `Showing ${ads.length} ads`}
          </span>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {!ads && !loading && (
        <p className="rounded-lg border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-500">
          {mode === "keyword"
            ? "Search by keyword to find winning ads."
            : brands?.length
              ? "Pick a brand above to load its ads."
              : "Find a brand to browse its top-scoring ads."}
        </p>
      )}
      {loading && !ads?.length && (
        <p className="py-10 text-center text-sm text-zinc-500">
          {source === "sample" ? "Loading…" : "Searching the ad library… a fresh search can take up to a minute."}
        </p>
      )}
      {ads?.length === 0 && !loading && (
        <p className="py-10 text-center text-sm text-zinc-500">No ads match. Try fewer keywords or a shorter run time.</p>
      )}

      {ads && ads.length > 0 && (
        <div className="mb-3 flex items-center gap-2 text-sm text-zinc-600">
          <span>Adding references to</span>
          {groupCount > 1 ? (
            <select className={INLINE_SELECT} value={targetGroup} onChange={(e) => setGroupIndex(Number(e.target.value))}>
              {Array.from({ length: groupCount }, (_, i) => (
                <option key={i} value={i}>
                  {groupLabel(i)}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-medium text-zinc-900">{groupLabel(0)}</span>
          )}
          <span className="text-xs text-zinc-400">Add one style reference and one format reference.</span>
        </div>
      )}

      <div
        className={`grid grid-cols-2 gap-4 transition-opacity lg:grid-cols-3 xl:grid-cols-4 ${
          loading && ads?.length ? "pointer-events-none opacity-50" : ""
        }`}
      >
        {ads?.map((ad) => {
          const checked = isSelected(ad.id);
          const added = addedTo(ad.id);
          return (
            <div
              key={ad.id}
              role="checkbox"
              aria-checked={checked}
              tabIndex={0}
              onClick={() => toggle(ad)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  toggle(ad);
                }
              }}
              className={`flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 bg-white text-left transition-colors ${
                checked ? "border-brand" : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <div className="relative bg-zinc-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- remote ad creative */}
                <img
                  src={ad.imageUrl}
                  alt={ad.headline || `${ad.brand} ad`}
                  loading="lazy"
                  className="aspect-[4/5] w-full object-contain"
                />
                <span
                  className={`absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-md border-2 text-xs text-white ${
                    checked ? "border-brand bg-brand" : "border-white bg-black/20"
                  }`}
                >
                  {checked && "✓"}
                </span>
                <span className="absolute top-2 right-2">
                  <ScoreBadge metrics={ad.metrics} />
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-center gap-2">
                  {ad.brandAvatar && (
                    // eslint-disable-next-line @next/next/no-img-element -- remote brand avatar
                    <img src={ad.brandAvatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{ad.brand}</p>
                    {ad.category && <p className="truncate text-xs text-zinc-500">{ad.category}</p>}
                  </div>
                </div>
                {ad.headline && <p className="line-clamp-2 text-xs font-medium text-zinc-800">{ad.headline}</p>}
                <dl className="grid grid-cols-3 gap-2 border-t border-zinc-100 pt-2">
                  <Metric label="Run time" value={ad.metrics.runDays === undefined ? "–" : `${ad.metrics.runDays}d`} />
                  {ad.metrics.duplicateCount !== undefined ? (
                    <Metric label="Duplicates" value={String(ad.metrics.duplicateCount)} />
                  ) : (
                    <Metric label="Started" value={ad.startedAt ? dateFormat.format(new Date(ad.startedAt)) : "–"} />
                  )}
                  <Metric label="Platforms" value={String(ad.platforms.length || "–")} />
                </dl>
                <div className="mt-auto flex flex-wrap items-center gap-1">
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                      ad.metrics.isActive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {ad.metrics.isActive ? "Active" : "Inactive"}
                  </span>
                  {ad.platforms.map((p) => (
                    <span key={p} className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
                      {PLATFORM_LABELS[p] ?? p}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {REFERENCE_ROLES.map((r) => {
                    const isAdded = added.some((a) => a.groupIndex === targetGroup && a.role === r);
                    const busy = pending.includes(`${ad.id}:${r}`);
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleQuickAdd(ad, r, isAdded);
                        }}
                        title={isAdded ? `Remove from ${groupLabel(targetGroup)}` : `Add to ${groupLabel(targetGroup)}`}
                        className={`rounded-md border px-2 py-1 text-xs font-medium ${
                          isAdded
                            ? "border-brand bg-brand text-white hover:bg-brand/85"
                            : "border-zinc-300 text-zinc-700 hover:border-brand hover:text-brand"
                        }`}
                      >
                        {busy ? "Adding…" : `${isAdded ? "✓" : "+"} ${REFERENCE_ROLE_LABELS[r]}`}
                      </button>
                    );
                  })}
                </div>
                {ad.sourceUrl && (
                  <div className="flex justify-end text-[11px]">
                    <a
                      href={ad.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-zinc-500 underline hover:text-zinc-800"
                    >
                      View source
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {ads && cursor && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadAds({ brandId: activeBrandId, more: true })}
            className="btn-secondary"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {selected.length > 0 && (
        <div className="sticky bottom-4 mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
          <span className="text-sm font-medium">{selected.length} selected</span>
          <span className="text-sm text-zinc-500">Add as</span>
          <select className={INLINE_SELECT} value={role} onChange={(e) => setRole(e.target.value as ReferenceRole)}>
            {REFERENCE_ROLES.map((r) => (
              <option key={r} value={r}>
                {REFERENCE_ROLE_LABELS[r]}s
              </option>
            ))}
          </select>
          <span className="text-sm text-zinc-500">in</span>
          <select className={INLINE_SELECT} value={targetGroup} onChange={(e) => setGroupIndex(Number(e.target.value))}>
            {Array.from({ length: groupCount }, (_, i) => (
              <option key={i} value={i}>
                {groupLabel(i)}
              </option>
            ))}
          </select>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setSelected([])} className="btn-secondary">
              Clear
            </button>
            <button type="button" onClick={add} disabled={adding} className="btn-primary">
              {adding ? "Adding…" : `Add ${selected.length}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
