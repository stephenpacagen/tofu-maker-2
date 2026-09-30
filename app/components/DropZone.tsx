"use client";

import { useRef, useState, type ReactNode } from "react";

/** Set on a reference image while it is dragged between style and format slots. */
export const REFERENCE_DRAG_TYPE = "application/x-tofu-reference";

const dragKind = (e: React.DragEvent) => {
  const types = Array.from(e.dataTransfer.types);
  if (types.includes("Files")) return "files" as const;
  if (types.includes(REFERENCE_DRAG_TYPE)) return "reference" as const;
  return null;
};

export function DropZone({
  onFiles,
  onReference,
  className = "",
  children,
}: {
  onFiles: (files: FileList) => void;
  onReference?: (id: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  // dragenter/dragleave also fire when crossing child elements, so track nesting depth.
  const depth = useRef(0);

  return (
    <div
      className={`rounded-xl transition-colors ${active ? "bg-zinc-50" : ""} ${className}`}
      onDragEnter={(e) => {
        const kind = dragKind(e);
        if (!kind || (kind === "reference" && !onReference)) return;
        e.preventDefault();
        depth.current += 1;
        setActive(true);
      }}
      onDragOver={(e) => {
        const kind = dragKind(e);
        if (!kind || (kind === "reference" && !onReference)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = kind === "files" ? "copy" : "move";
      }}
      onDragLeave={(e) => {
        const kind = dragKind(e);
        if (!kind || (kind === "reference" && !onReference)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      }}
      onDrop={(e) => {
        const kind = dragKind(e);
        if (!kind || (kind === "reference" && !onReference)) return;
        e.preventDefault();
        depth.current = 0;
        setActive(false);
        if (kind === "reference") {
          const id = e.dataTransfer.getData(REFERENCE_DRAG_TYPE);
          if (id) onReference?.(id);
          return;
        }
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
      }}
    >
      {children}
    </div>
  );
}
