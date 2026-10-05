"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { REFERENCE_ROLES, REFERENCE_ROLE_LABELS, type ReferenceRole } from "@/lib/types";

export type CartGroup = { id: string; name: string; description: string };

export type CartReference = {
  id: string;
  groupId: string;
  role: ReferenceRole;
  previewUrl: string;
  label: string;
};

export function ReferenceCart({
  open,
  onOpen,
  onClose,
  brandColor,
  groups,
  references,
  adCountFor,
  onRenameGroup,
  onDescribeGroup,
  onRemoveGroup,
  onAddGroup,
  onRemoveReference,
  canAddGroup,
  onReview,
  canReview,
  reviewStatus,
  onBack,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  brandColor: string;
  groups: CartGroup[];
  references: CartReference[];
  adCountFor: (groupId: string) => number;
  onRenameGroup: (groupId: string, name: string) => void;
  onDescribeGroup: (groupId: string, description: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onAddGroup: () => void;
  onRemoveReference: (id: string) => void;
  canAddGroup: boolean;
  /** Library flow: continue to the brief from the cart instead of the page footer. */
  onReview?: () => void;
  canReview?: boolean;
  reviewStatus?: string;
  onBack?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const lastId = references[references.length - 1]?.id;
  const lastGroupId = references[references.length - 1]?.groupId;
  useEffect(() => {
    if (!open || !lastGroupId) return;
    document.getElementById(`cart-group-${lastGroupId}`)?.scrollIntoView({ block: "nearest" });
  }, [open, lastId, lastGroupId]);

  if (!mounted) return null;

  return createPortal(
    <div style={{ "--brand": brandColor } as React.CSSProperties}>
      {!open && (
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={false}
          aria-controls="reference-cart"
          className="fixed top-1/2 right-0 z-40 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-xl bg-brand px-2.5 py-4 text-white shadow-lg"
        >
          <span className="text-xs font-medium [writing-mode:vertical-rl]">Selections</span>
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-semibold text-brand">
            {references.length}
          </span>
        </button>
      )}

      <aside
        id="reference-cart"
        role="dialog"
        aria-label="Selections"
        aria-modal="false"
        inert={open ? undefined : true}
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Selections</h2>
            <p className="text-xs text-zinc-500">
              {references.length} reference{references.length === 1 ? "" : "s"} in {groups.length} group
              {groups.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            Close
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {groups.map((group, index) => {
            const name = group.name.trim() || `Reference group ${index + 1}`;
            const ads = adCountFor(group.id);
            return (
              <section
                key={group.id}
                id={`cart-group-${group.id}`}
                className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={group.name}
                    onChange={(e) => onRenameGroup(group.id, e.target.value)}
                    aria-label={`Name for ${name}`}
                    placeholder={`Reference group ${index + 1}`}
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-zinc-900 outline-none hover:border-zinc-300 focus:border-brand focus:bg-white"
                  />
                  {ads > 0 && <span className="shrink-0 text-xs text-zinc-400">{ads} ads</span>}
                  {groups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveGroup(group.id)}
                      className="px-1 text-xl leading-none text-zinc-400 hover:text-rose-600"
                      aria-label={`Remove ${name}`}
                    >
                      ×
                    </button>
                  )}
                </div>

                <label className="field">
                  <span>Description</span>
                  <textarea
                    rows={3}
                    value={group.description}
                    onChange={(e) => onDescribeGroup(group.id, e.target.value)}
                    placeholder="Write the description for this reference group"
                    aria-label={`Description for ${name}`}
                  />
                </label>

                <div className="mt-3 flex flex-col gap-3">
                  {REFERENCE_ROLES.map((role) => {
                    const set = references.filter((r) => r.groupId === group.id && r.role === role);
                    return (
                      <div key={role}>
                        <p className="mb-1.5 text-xs font-medium text-zinc-500">
                          {REFERENCE_ROLE_LABELS[role]}s ({set.length})
                        </p>
                        {set.length === 0 ? (
                          <p className="text-xs text-zinc-400">None yet</p>
                        ) : (
                          <ul className="flex flex-col gap-1.5">
                            {set.map((reference) => (
                              <li
                                key={reference.id}
                                className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-1.5"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                                <img
                                  src={reference.previewUrl}
                                  alt=""
                                  className="h-14 w-11 shrink-0 rounded-md bg-zinc-100 object-contain"
                                />
                                <span className="min-w-0 flex-1 truncate text-xs text-zinc-700" title={reference.label}>
                                  {reference.label}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onRemoveReference(reference.id)}
                                  className="shrink-0 px-1 text-xs text-zinc-500 hover:text-rose-600"
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="flex flex-col gap-3 border-t border-zinc-200 p-4">
          {reviewStatus && <p className="text-xs text-zinc-500">{reviewStatus}</p>}
          {canAddGroup && (
            <button
              type="button"
              onClick={onAddGroup}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 text-sm text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
            >
              <span className="text-xl leading-none">+</span> Add reference group
            </button>
          )}
          {onReview && (
            <div className="flex items-center gap-2">
              {onBack && (
                <button type="button" onClick={onBack} className="btn-secondary">
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={onReview}
                disabled={!canReview}
                className="btn-primary flex-1"
              >
                Next Step
              </button>
            </div>
          )}
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
